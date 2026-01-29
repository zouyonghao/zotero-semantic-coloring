import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { buildSemanticColoringPopup } from "./modules/semanticColoring";

declare const ztoolkit: ZToolkit;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // Register the event listener for PDF text selection popup
  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    (event) => {
      const { reader, doc, params, append } = event;
      // Capture the selected text for semantic coloring
      if (params.annotation?.text) {
        addon.data.semanticColors.selectedText = params.annotation.text.trim();
      }
      // Call the hook function
      onReaderPopupShow(event);
    },
    addon.data.config.addonID,
  );
}

function onReaderPopupShow(
  event: _ZoteroTypes.Reader.EventParams<"renderTextSelectionPopup">,
) {
  ztoolkit.log("onReaderPopupShow called - building semantic coloring popup");
  // Build semantic coloring popup elements
  buildSemanticColoringPopup(event);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onReaderPopupShow,
};
