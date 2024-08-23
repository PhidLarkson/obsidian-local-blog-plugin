import { Plugin, Notice, Modal, App, PluginSettingTab, TFile, MarkdownView, Setting } from 'obsidian';

interface BlogPluginSettings {
  host: string;
  slug: string;
  saveLocation: string;
}

const DEFAULT_SETTINGS: BlogPluginSettings = {
  host: '',
  slug: '',
  saveLocation: 'blog-posts',
};

export default class BlogPlugin extends Plugin {
  settings: BlogPluginSettings;

  async onload() {
    await this.loadSettings();

    // Add ribbon icon to fetch and save blog post
    this.addRibbonIcon('book-down', 'Load a blog to local', async () => {
      new FetchBlogModal(this.app, this).open();
    });

    // Add ribbon icon to show blog directory files with stars
    this.addRibbonIcon('library-big', 'All local blogs', async () => {
      await this.showAllBlogs();
    });

    this.addSettingTab(new BlogPluginSettingTab(this.app, this));
  }

  async fetchBlogPost(): Promise<string | null> {
    const { host, slug } = this.settings;
    const query = `
      query Publication($host: String!, $slug: String!) {
        publication(host: $host) {
          post(slug: $slug) {
            content {
              markdown
            }
          }
        }
      }
    `;
    const variables = { host, slug };

    try {
      const response = await fetch('https://gql.hashnode.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });

      const result = await response.json();
      const markdownContent = result?.data?.publication?.post?.content?.markdown;

      if (!markdownContent) {
        new Notice('Could not fetch the blog post. Please check your host and slug.');
        return null;
      }

      return markdownContent;
    } catch (error) {
      console.error('Error fetching blog:', error);
      new Notice('Failed to fetch the blog post. Please try again.');
      return null;
    }
  }

  async saveFetchedBlog() {
    const markdownContent = await this.fetchBlogPost();
    if (markdownContent) {
      const fileName = `${this.settings.slug}.md`;
      const filePath = `${this.settings.saveLocation}/${fileName}`;

      try {
        await this.app.vault.create(filePath, markdownContent);
        new Notice(`Blog saved as ${fileName} in ${this.settings.saveLocation}`);
      } catch (error) {
        console.error('Error saving blog:', error);
        new Notice('Failed to save the blog. Please try again.');
      }
    }
  }

  async showAllBlogs() {
    const { saveLocation } = this.settings;
    const folder = this.app.vault.getAbstractFileByPath(saveLocation);

    if (folder && folder instanceof TFile) {
      new Notice(`${saveLocation} is a file, not a folder.`);
      return;
    }

    const files = folder ? folder.children.filter(child => child instanceof TFile) : [];
    if (files.length === 0) {
      new Notice(`No files found in ${saveLocation}.`);
      return;
    }

    new AllBlogsModal(this.app, this, files as TFile[]).open();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class FetchBlogModal extends Modal {
  plugin: BlogPlugin;

  constructor(app: App, plugin: BlogPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Load a blog on local' });
    contentEl.createEl('small', { text: 'Efie is home in Akan' });

    // Neatly arrange input fields with labels
    const formEl = contentEl.createEl('div', { cls: 'blog-fetch-form' });

    formEl.createEl('label', { text: 'Publication Host:' });
    const hostInput = formEl.createEl('input', {
      type: 'text',
      placeholder: 'Enter publication host. eg. username.hashnode.dev',
    });
    hostInput.value = this.plugin.settings.host;

    formEl.createEl('label', { text: 'Blog Post Slug:' });
    const slugInput = formEl.createEl('input', {
      type: 'text',
      placeholder: 'Enter blog post slug. eg. my-blog-post',
    });
    slugInput.value = this.plugin.settings.slug;

    const fetchButton = contentEl.createEl('button', { text: 'Load Blog' });
    fetchButton.onclick = async () => {
      this.plugin.settings.host = hostInput.value.trim();
      this.plugin.settings.slug = slugInput.value.trim();
      await this.plugin.saveSettings();
      await this.plugin.saveFetchedBlog();
      this.close();
    };

    // Add some styling
    contentEl.createEl('style').textContent = `
      .blog-fetch-form {
        display: grid;
        gap: 10px;
        margin-top: 10px;
      }
      .blog-fetch-form label {
        font-weight: bold;
      }
      .blog-fetch-form input {
        padding: 5px;
        font-size: 1rem;
      }
      button {
        margin-top: 15px;
        padding: 5px 10px;
        font-size: 1rem;
      }
    `;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class AllBlogsModal extends Modal {
  plugin: BlogPlugin;
  files: TFile[];

  constructor(app: App, plugin: BlogPlugin, files: TFile[]) {
    super(app);
    this.plugin = plugin;
    this.files = files;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Local Blog Posts' });

    this.files.forEach(file => {
      const item = contentEl.createEl('div', { cls: 'blog-list-item' });
      const starIcon = item.createEl('span', { text: '★', cls: 'star-icon' });
      const fileNameEl = item.createEl('span', { text: file.name });

      item.addEventListener('click', async () => {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        this.close();
      });
    });

    // Add styling for the blog list items
    contentEl.createEl('style').textContent = `
      .blog-list-item {
        display: flex;
        align-items: center;
        cursor: pointer;
        margin: 5px 0;
      }
      .star-icon {
        color: gold;
        margin-right: 8px;
      }
      .blog-list-item:hover {
        background-color: #333;
        border-radius: 4px;
      }
      .blog-list-item span {
        padding: 5px;
      }
    `;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class BlogPluginSettingTab extends PluginSettingTab {
  plugin: BlogPlugin;

  constructor(app: App, plugin: BlogPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl('h2', { text: 'Blog Plugin Settings' });

    new Setting(containerEl)
      .setName('Publication Host')
      .setDesc('The host of your blog publication (e.g., blog.hashnode.dev).')
      .addText(text => text
        .setValue(this.plugin.settings.host)
        .onChange(async (value) => {
          this.plugin.settings.host = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Blog Slug')
      .setDesc('The slug of the blog post you want to fetch.')
      .addText(text => text
        .setValue(this.plugin.settings.slug)
        .onChange(async (value) => {
          this.plugin.settings.slug = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Save Location')
      .setDesc('Location to save your fetched blog posts.')
      .addText(text => text
        .setValue(this.plugin.settings.saveLocation)
        .onChange(async (value) => {
          this.plugin.settings.saveLocation = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
