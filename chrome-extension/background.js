chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await openSidePanel(tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "OPEN_VNPOST_PANEL_FROM_PAGE") return false;
  openSidePanel(sender.tab).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab?.url?.startsWith("https://bccp.vnpost.vn/")) return;
  await openSidePanel(tab);
});

async function openSidePanel(tab) {
  if (!chrome.sidePanel?.open || !tab?.windowId) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.warn("Không tự mở được side panel; hãy bấm icon extension một lần.", error);
  }
}
