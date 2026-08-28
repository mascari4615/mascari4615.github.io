document.getElementById("open").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("bookmarks").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("bookmarks.html") });
});
