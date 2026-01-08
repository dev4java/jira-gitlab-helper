import { ConfluenceClient, IConfluencePage } from '../integrations/confluence-client';
import { Logger } from '../utils/logger';

export class ConfluenceService {
  constructor(
    private readonly _confluenceClient: ConfluenceClient,
    private readonly _logger: Logger
  ) {}

  /**
   * 测试Confluence连接
   */
  public async testConnection(): Promise<boolean> {
    return await this._confluenceClient.testConnection();
  }

  /**
   * 获取页面内容
   */
  public async getPage(pageId: string): Promise<IConfluencePage> {
    return await this._confluenceClient.getPage(pageId);
  }

  /**
   * 从URL获取页面内容
   */
  public async getPageByUrl(url: string): Promise<IConfluencePage | null> {
    const pageId = this._confluenceClient.extractPageIdFromUrl(url);
    if (!pageId) {
      this._logger.warn('Could not extract page ID from URL', { url });
      return null;
    }

    return await this.getPage(pageId);
  }

  /**
   * 从文本中检测并获取所有Confluence页面内容
   */
  public async fetchConfluenceLinksContent(text: string): Promise<Map<string, IConfluencePage>> {
    const links = this._confluenceClient.detectConfluenceLinks(text);
    const pages = new Map<string, IConfluencePage>();

    if (links.length === 0) {
      return pages;
    }

    this._logger.info('Detected Confluence links', { count: links.length, links });

    for (const link of links) {
      try {
        const page = await this.getPageByUrl(link);
        if (page) {
          pages.set(link, page);
          this._logger.info('Fetched Confluence page', { 
            link, 
            pageId: page.id, 
            title: page.title 
          });
        }
      } catch (error) {
        this._logger.error('Failed to fetch Confluence page', { link, error });
        // 继续处理其他链接
      }
    }

    return pages;
  }

  /**
   * 将Confluence页面内容格式化为可读文本
   */
  public formatPageContent(page: IConfluencePage): string {
    return `
## Confluence: ${page.title}

**链接**: ${page.url}

**内容**:
${page.body}

---
`;
  }

  /**
   * 将所有Confluence页面内容合并为文本
   */
  public formatAllPagesContent(pages: Map<string, IConfluencePage>): string {
    if (pages.size === 0) {
      return '';
    }

    let content = '\n\n# 📄 相关Confluence文档\n\n';
    
    for (const [, page] of pages.entries()) {
      content += this.formatPageContent(page);
    }

    return content;
  }
}

