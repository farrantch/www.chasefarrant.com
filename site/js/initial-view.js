(() => {
  const root = document.documentElement;
  // Match the portfolio's section IDs before the body has been parsed.
  const browseTargets = new Set(['portfolio', 'portfolio-title', 'projects', 'about', 'career', 'notes', 'contact']);
  const showInitialView = () => {
    root.dataset.initialView = browseTargets.has(location.hash.slice(1)) ? 'browse' : 'terminal';
  };
  showInitialView();
  // Keep Browse usable if the main module is delayed or fails to load.
  addEventListener('hashchange', () => {
    if (root.hasAttribute('data-initial-view')) showInitialView();
  });
})();
