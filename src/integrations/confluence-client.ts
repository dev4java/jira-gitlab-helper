import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

export interface IConfluenceClientConfig {
  serverUrl: string;
  username: string;
  credential: string;
  authType: 'password' | 'apiToken';
}

export interface IConfluencePage {
  id: string;
  title: string;
  body: string;
  version: number;
  url: string;
}

export class ConfluenceClient {
  private _axiosInstance: AxiosInstance;
  private readonly _logger: Logger;
  private _serverUrl: string;

  constructor(config: IConfluenceClientConfig, logger: Logger) {
    this._logger = logger;
    this._serverUrl = config.serverUrl;

    const authHeader = this._createAuthHeader(config.username, config.credential);

    this._axiosInstance = axios.create({
      baseURL: `${config.serverUrl}/rest/api`,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    this._logger.info('Confluence client initialized', { serverUrl: config.serverUrl });
  }

  private _createAuthHeader(username: string, credential: string): string {
    const token = Buffer.from(`${username}:${credential}`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * 测试连接
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this._axiosInstance.get('/user/current');
      this._logger.info('Confluence connection test successful');
      return true;
    } catch (error) {
      this._logger.error('Confluence connection test failed', error);
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('连接超时，请检查Confluence服务器地址');
        }
        if (error.response?.status === 401) {
          throw new Error('认证失败，请检查用户名和密码/API Token');
        }
      }
      throw error;
    }
  }

  /**
   * 从URL获取页面ID
   */
  public extractPageIdFromUrl(url: string): string | null {
    // 支持多种Confluence URL格式:
    // https://confluence.example.com/pages/viewpage.action?pageId=123456
    // https://confluence.example.com/display/SPACE/Page+Title?pageId=123456
    // https://confluence.example.com/wiki/spaces/SPACE/pages/123456/Page+Title
    
    // 格式1: pageId参数
    const pageIdMatch = url.match(/pageId=(\d+)/);
    if (pageIdMatch) {
      return pageIdMatch[1];
    }

    // 格式2: /pages/数字/
    const pagesMatch = url.match(/\/pages\/(\d+)\//);
    if (pagesMatch) {
      return pagesMatch[1];
    }

    return null;
  }

  /**
   * 获取页面内容
   */
  public async getPage(pageId: string): Promise<IConfluencePage> {
    try {
      this._logger.info('Fetching Confluence page', { pageId });

      const response = await this._axiosInstance.get(`/content/${pageId}`, {
        params: {
          expand: 'body.storage,version',
        },
      });

      const data = response.data;
      const page: IConfluencePage = {
        id: data.id,
        title: data.title,
        body: this._extractTextFromHtml(data.body.storage.value),
        version: data.version.number,
        url: `${this._serverUrl}${data._links.webui}`,
      };

      this._logger.info('Confluence page fetched successfully', { 
        pageId, 
        title: page.title 
      });

      return page;
    } catch (error) {
      this._logger.error('Failed to fetch Confluence page', error);
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error(`获取Confluence页面超时: ${pageId}`);
        }
        if (error.response?.status === 404) {
          throw new Error(`Confluence页面不存在: ${pageId}`);
        }
        if (error.response?.status === 401) {
          throw new Error('Confluence认证失败');
        }
      }
      
      throw new Error(`获取Confluence页面失败: ${String(error)}`);
    }
  }

  /**
   * 从HTML中提取纯文本
   */
  private _extractTextFromHtml(html: string): string {
    // 移除HTML标签，保留文本内容
    let text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // 清理多余的空行
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
  }

  /**
   * 从文本中检测Confluence链接
   */
  public detectConfluenceLinks(text: string): string[] {
    const links: string[] = [];
    
    // 匹配Confluence URL的正则表达式
    const patterns = [
      // https://confluence.example.com/pages/viewpage.action?pageId=123456
      /https?:\/\/[^\s]+confluence[^\s]*pageId=\d+/gi,
      // https://confluence.example.com/wiki/spaces/SPACE/pages/123456
      /https?:\/\/[^\s]+confluence[^\s]*\/pages\/\d+/gi,
      // https://confluence.example.com/display/SPACE/Page+Title
      /https?:\/\/[^\s]+confluence[^\s]*\/display\/[^\s]+/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        links.push(...matches);
      }
    }

    // 去重
    return [...new Set(links)];
  }
}

