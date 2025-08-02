// src/services/ExclusionService.js
class ExclusionService {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.exclusionKey = 'excludedSites';
  }

  async getExcludedSites() {
    return (await this.storageManager.get(this.exclusionKey)) || [];
  }

  async addExcludedSite(url) {
    const sites = await this.getExcludedSites();
    if (!sites.includes(url)) {
      sites.push(url);
      await this.storageManager.set(this.exclusionKey, sites);
      return true;
    }
    return false;
  }

  async removeExcludedSite(url) {
    let sites = await this.getExcludedSites();
    const initialLength = sites.length;
    sites = sites.filter(site => site !== url);
    if (sites.length < initialLength) {
      await this.storageManager.set(this.exclusionKey, sites);
      return true;
    }
    return false;
  }

  async isSiteExcluded(url) {
    const sites = await this.getExcludedSites();
    return sites.includes(url);
  }
}

export default ExclusionService;
