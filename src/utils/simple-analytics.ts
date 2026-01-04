/**
 * Simple Analytics - Minimal Working Version
 */

class SimpleAnalytics {
  private sessionId: string | null = null;
  private apiUrl = 'https://unexcited-nondepreciatively-justice.ngrok-free.dev/api/simple-analytics';

  constructor() {
    if (typeof window !== 'undefined') {
      const enableAnalytics = localStorage.getItem('enableAnalytics') === 'true';
      if (enableAnalytics) {
        this.initSession();
      } else {
        console.log('Analytics disabled - running in offline mode');
      }
    }
  }

  private async initSession() {
    try {
      console.log('Testing Simple Analytics...');
      
      const testResponse = await fetch(`${this.apiUrl}/test`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      
      if (!testResponse.ok) {
        console.warn('Analytics backend not available, running in offline mode');
        return;
      }
      
      const testResult = await testResponse.json();
      console.log('Analytics test result:', testResult);
      
      if (testResult.status !== 'working') {
        console.warn('Analytics system not working:', testResult.message);
        return;
      }

      const sessionData = {
        deviceType: this.getDeviceType(),
        browserName: this.getBrowserName(),
        referrer: document.referrer ? new URL(document.referrer).hostname : 'direct'
      };

      const response = await fetch(`${this.apiUrl}/session`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(sessionData)
      });

      if (response.ok) {
        const result = await response.json();
        this.sessionId = result.sessionId;
        console.log('Analytics session created:', this.sessionId);
        
        this.trackPageView(window.location.pathname, document.title);
      } else {
        console.error('Failed to create analytics session');
      }
    } catch (error) {
      console.error('Analytics initialization failed:', error);
    }
  }

  public trackPageView(pagePath: string, pageTitle: string) {
    if (!this.sessionId || typeof window === 'undefined') return;

    const pageData = {
      sessionId: this.sessionId,
      pagePath,
      pageTitle
    };

    fetch(`${this.apiUrl}/page-view`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(pageData)
    }).then(response => {
      if (response.ok) {
        console.log('Page view tracked:', pagePath);
      }
    }).catch(error => {
      console.error('Page view tracking failed:', error);
    });
  }

  public trackInteraction(type: string, elementId?: string, elementText?: string) {
    if (!this.sessionId || typeof window === 'undefined') return;

    const interactionData = {
      sessionId: this.sessionId,
      pagePath: window.location.pathname,
      interactionType: type,
      elementId,
      elementText
    };

    fetch(`${this.apiUrl}/interaction`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(interactionData)
    }).then(response => {
      if (response.ok) {
        console.log('Interaction tracked:', type);
      }
    }).catch(error => {
      console.error('Interaction tracking failed:', error);
    });
  }

  private getDeviceType(): string {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    if (/mobile|iphone|android/i.test(userAgent)) return 'mobile';
    return 'desktop';
  }

  private getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'chrome';
    if (userAgent.includes('Firefox')) return 'firefox';
    if (userAgent.includes('Safari')) return 'safari';
    if (userAgent.includes('Edge')) return 'edge';
    return 'unknown';
  }
}

export const simpleAnalytics = new SimpleAnalytics();

export const trackPageView = (pagePath: string, pageTitle: string) => 
  simpleAnalytics.trackPageView(pagePath, pageTitle);

export const trackClick = (elementId: string, elementText: string) => 
  simpleAnalytics.trackInteraction('click', elementId, elementText);

export const trackUpload = (fileName: string) => 
  simpleAnalytics.trackInteraction('upload', 'file-upload', fileName);
