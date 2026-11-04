export function revealActiveTab(host: HTMLElement) {
  const activeTab = host.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!activeTab) return;
  const hostRect = host.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  if (tabRect.left < hostRect.left) host.scrollLeft -= hostRect.left - tabRect.left;
  else if (tabRect.right > hostRect.right) host.scrollLeft += tabRect.right - hostRect.right;
}
