window.BenefitRegistry = (function () {
    const checkers = [];

    /**
     * Register a benefit checker.
     * @param {{
     *   key: string,                          // 'PACE' | 'LIS' | ...
     *   label?: string,
     *   run: (members: any[], context: {
     *       clientId: string,
     *       client: any,
     *       Utils: any,
     *       extras?: any
     *   }) => Promise<any[]>                   // returns updated members
     * }} checker
     */
    function register(checker) {
        if (!checker?.key || typeof checker.run !== 'function') {
            console.error('BenefitRegistry.register: invalid checker', checker);
            return;
        }
        // Replace if same key already registered (helps with hot-reload)
        const existing = checkers.findIndex(c => c.key === checker.key);
        if (existing >= 0) checkers[existing] = checker;
        else checkers.push(checker);
    }

    function getAll() { return checkers.slice(); }
    function getByKey(key) { return checkers.find(c => c.key === key) || null; }

    /**
     * Run every registered benefit check sequentially.
     * Each checker may mutate & save; we still return the final members array.
     */
    async function runAll(members, context) {
        for (const checker of checkers) {
            try {
                const result = await checker.run(members, context);
                if (Array.isArray(result)) members = result;
            } catch (err) {
                console.error(`BenefitRegistry: error running ${checker.key}:`, err);
            }
        }
        return members;
    }

    return { register, getAll, getByKey, runAll };
})();