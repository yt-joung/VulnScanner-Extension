const DEFAULT_FILTERS = [
    '^\\s*$', // Empty or whitespace only
    '^<!--\\s*-->$', // Empty HTML comments
];

export const Settings = {
    async getCommentFilters() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['commentFilters'], (result) => {
                resolve(result.commentFilters || DEFAULT_FILTERS);
            });
        });
    },

    async saveCommentFilters(filters) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ commentFilters: filters }, () => {
                resolve();
            });
        });
    },

    async addFilter(pattern) {
        const filters = await this.getCommentFilters();
        if (!filters.includes(pattern)) {
            filters.push(pattern);
            await this.saveCommentFilters(filters);
        }
    },

    async removeFilter(pattern) {
        const filters = await this.getCommentFilters();
        const newFilters = filters.filter(f => f !== pattern);
        await this.saveCommentFilters(newFilters);
    },

    async resetFilters() {
        await this.saveCommentFilters(DEFAULT_FILTERS);
    },

    async getMaxLinks() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['maxLinks'], (result) => {
                resolve(result.maxLinks || 1000); // Default 1000
            });
        });
    },

    async saveMaxLinks(count) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ maxLinks: count }, () => {
                resolve();
            });
        });
    }
};
