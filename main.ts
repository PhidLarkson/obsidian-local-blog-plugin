import { Plugin, Notice, Modal, Setting, App, PluginSettingTab, TFile, MarkdownView } from 'obsidian';

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
  recentBlogs: string[] = []; // Array to keep track of recent blog file paths

  async onload() {
  await this.loadSettings();

  // Add ribbon icon to fetch and render blog post
  this.addRibbonIcon('globe', 'Fetch and Render Blog Post', async () => {
    new FetchBlogModal(this.app, this).open();
  });

  // Add ribbon icon to show recent blogs
  // this.addRibbonIcon('star', 'Show Recent Blogs', async () => {
	// await this.showRecentBlogs();
  // });  

  // Add the plugin settings tab
  this.addSettingTab(new BlogPluginSettingTab(this.app, this));

  // Ensure that recent blogs are correctly loaded
  await this.loadSettings();
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

  async renderFetchedBlog() {
    const markdownContent = await this.fetchBlogPost();
    if (markdownContent) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        view.editor.setValue(markdownContent);
        new Notice('Blog post rendered successfully!');
      } else {
        new Notice('Please open a markdown file to render the blog content.');
      }
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
        await this.openMarkdownFile(filePath);
        this.recentBlogs.push(filePath);
        await this.saveSettings();
      } catch (error) {
        console.error('Error saving blog:', error);
        new Notice('Failed to save the blog. Please try again.');
      }
    }
  }

  async openMarkdownFile(filePath: string) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }
  }

  async showRecentBlogs() {
    new RecentBlogsModal(this.app, this).open();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    const savedRecentBlogs = await this.loadData();
    if (savedRecentBlogs && savedRecentBlogs.recentBlogs) {
      this.recentBlogs = savedRecentBlogs.recentBlogs;
    }
  }

  async saveSettings() {
    await this.saveData({ ...this.settings, recentBlogs: this.recentBlogs });
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
    contentEl.createEl('h3', { text: 'Fetch and Render Blog Post' });

    const hostInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Enter publication host',
    });
    hostInput.value = this.plugin.settings.host;

    const slugInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Enter blog post slug',
    });
    slugInput.value = this.plugin.settings.slug;

    const fetchButton = contentEl.createEl('button', { text: 'Open in Obsidian' });
    fetchButton.onclick = async () => {
      this.plugin.settings.host = hostInput.value.trim();
      this.plugin.settings.slug = slugInput.value.trim();
      await this.plugin.saveSettings();
      await this.plugin.renderFetchedBlog();
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class RecentBlogsModal extends Modal {
  plugin: BlogPlugin;

  constructor(app: App, plugin: BlogPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Recent Blogs' });

    if (this.plugin.recentBlogs.length === 0) {
      contentEl.createEl('p', { text: 'No recent blogs found.' });
      return;
    }

    this.plugin.recentBlogs.forEach(filePath => {
      const fileName = filePath.split('/').pop() || filePath;
      const item = contentEl.createEl('div', { text: fileName });
      item.addEventListener('click', async () => {
        await this.plugin.openMarkdownFile(filePath);
        this.close();
      });
    });
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
