import { config } from "../../package.json";

// Define semantic color mappings
export interface SemanticColor {
  name: string;
  color: string; // Hex color code
  description: string;
}

export const SEMANTIC_COLORS: Record<string, SemanticColor> = {
  challenge: {
    name: "Challenge",
    color: "#3498db", // Blue
    description: "Identify challenges or problems in the text"
  },
  insight: {
    name: "Insight",
    color: "#2ecc71", // Green
    description: "Mark key insights or findings"
  },
  method: {
    name: "Method",
    color: "#f1c40f", // Yellow
    description: "Highlight methodologies or approaches"
  },
  conclusion: {
    name: "Conclusion",
    color: "#9b59b6", // Purple
    description: "Mark conclusions or key takeaways"
  },
  question: {
    name: "Question",
    color: "#e74c3c", // Red
    description: "Indicate questions or areas for further investigation"
  },
  quote: {
    name: "Quote",
    color: "#1abc9c", // Teal
    description: "Mark important quotes or citations"
  }
};

// Register the semantic coloring prompt
export function registerSemanticColoringPrompt() {
  ztoolkit.Prompt.register([
    {
      name: "Semantic Coloring",
      label: config.addonInstance,
      when: () => {
        // Show when there's a PDF selection
        const reader = Zotero.Reader.getReader();
        if (!reader) return false;

        // Check if there's selected text in the PDF viewer
        const selectedText = addon.data.semanticColors.selectedText ||
          (reader._internalReader as any)?.selectedText ||
          "";
        return selectedText && selectedText.length > 0;
      },
      callback: async (prompt) => {
        const container = prompt.createCommandsContainer() as HTMLDivElement;
        container.style.padding = "10px";
        container.style.display = "grid";
        container.style.gridTemplateColumns = "repeat(auto-fill, minmax(150px, 1fr))";
        container.style.gap = "10px";

        // Get the selected text from the PDF
        const reader = Zotero.Reader.getReader();
        const selectedText = addon.data.semanticColors.selectedText ||
          (reader?._internalReader as any)?.selectedText ||
          "";

        prompt.inputNode.placeholder = "Select a semantic category for the highlighted text...";

        // Create color buttons
        for (const [key, semanticColor] of Object.entries(SEMANTIC_COLORS)) {
          const doc = container.ownerDocument || prompt.inputNode.ownerDocument;
          if (!doc) continue;

          const colorButton = ztoolkit.UI.createElement(doc, "button", {
            id: `semantic-color-${key}`,
            classList: ["semantic-color-btn"],
            styles: {
              backgroundColor: semanticColor.color,
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "8px 12px",
              margin: "2px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "center",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              transition: "transform 0.1s"
            },
            properties: {
              innerHTML: `<div>${semanticColor.name}</div><div style="font-size: 10px; opacity: 0.8;">${semanticColor.description}</div>`,
              onclick: async () => {
                await applySemanticColor(reader, selectedText, key, semanticColor);
                (prompt as any).confirm(); // Use confirm instead of exit
              }
            }
          });

          container.appendChild(colorButton);
        }

        // Add a cancel button
        const doc = container.ownerDocument || prompt.inputNode.ownerDocument;
        if (doc) {
          const cancelButton = ztoolkit.UI.createElement(doc, "button", {
            id: "semantic-color-cancel",
            styles: {
              gridColumn: "1 / -1",
              backgroundColor: "#95a5a6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "8px 12px",
              margin: "2px",
              cursor: "pointer",
              fontSize: "12px"
            },
            properties: {
              innerText: "Cancel",
              onclick: () => {
                (prompt as any).confirm(); // Use confirm instead of exit
              }
            }
          });

          container.appendChild(cancelButton);
        }
      }
    }
  ]);
}

// Apply semantic color to the selected text in PDF
export async function applySemanticColor(
  reader: _ZoteroTypes.ReaderInstance | null,
  selectedText: string,
  semanticKey: string,
  semanticColor: SemanticColor
) {
  if (!reader || !reader.itemID) {
    ztoolkit.log("No active reader found or invalid item ID");
    return;
  }

  try {
    // Attempt to create the annotation using Zotero's API
    const item = Zotero.Items.get(reader.itemID);
    if (!item || !item.isPDFAttachment()) {
      ztoolkit.log("Current item is not a PDF attachment");
      return;
    }

    // Get the current selection from the PDF viewer
    const internalReader = reader._internalReader;
    let position = null;
    let pageLabel = null;

    // Try to get position from internal reader - we need the position with rects
    if (internalReader && (internalReader as any)._state?.selectedAnnotationIDs?.length === 0) {
      // Try to get from primary view's selection
      const primaryView = (internalReader as any)._primaryView;
      if (primaryView && primaryView._selectionRanges?.length > 0) {
        const selectionRanges = primaryView._selectionRanges;
        // Build position from selection ranges
        const rects: number[][] = [];
        let pageIndex = 0;

        for (const range of selectionRanges) {
          if (range.position) {
            pageIndex = range.position.pageIndex;
            if (range.position.rects) {
              rects.push(...range.position.rects);
            }
          }
        }

        if (rects.length > 0) {
          position = {
            pageIndex: pageIndex,
            rects: rects
          };
          pageLabel = String(pageIndex + 1);
        }
      }
    }

    // Fallback: Try to get position from _currentSelection
    if (!position && internalReader && (internalReader as any)._currentSelection) {
      const selection = (internalReader as any)._currentSelection;
      if (selection && selection.position) {
        position = selection.position;
        // Ensure position has rects for highlight annotations
        if (!position.rects || position.rects.length === 0) {
          ztoolkit.log("Selection position missing rects, cannot create highlight annotation");
          position = null;
        }
      }
      if (selection && selection.pageIndex !== undefined) {
        pageLabel = String(selection.pageIndex + 1);
      }
    }

    // If we still don't have valid position data, try using reader's createAnnotation method
    if (!position || !position.rects || position.rects.length === 0) {
      ztoolkit.log("No valid position with rects found, trying native annotation creation...");

      // Try to use the reader's built-in annotation creation
      try {
        // Check if there's a pending annotation we can modify
        const pendingAnnotation = addon.data.semanticColors.pendingAnnotation;
        if (pendingAnnotation && pendingAnnotation.position && pendingAnnotation.position.rects) {
          position = pendingAnnotation.position;
          pageLabel = String((pendingAnnotation.position.pageIndex || 0) + 1);
        } else {
          // As a last resort, show error to user
          new ztoolkit.ProgressWindow(config.addonName)
            .createLine({
              text: "Please select text in the PDF first",
              type: "error"
            })
            .show();
          return;
        }
      } catch (e) {
        ztoolkit.log("Native annotation creation failed:", e);
        new ztoolkit.ProgressWindow(config.addonName)
          .createLine({
            text: "Could not get selection position. Please try selecting text again.",
            type: "error"
          })
          .show();
        return;
      }
    }

    // Calculate proper sortIndex from position
    const pageIndex = position.pageIndex || 0;
    const firstRect = position.rects[0];
    // sortIndex format: PPPPP|YYYYYY|XXXXX (5|6|5 digits for page|y-position|x-position)
    const yPos = firstRect ? Math.floor(firstRect[1]) : 0;
    const xPos = firstRect ? Math.floor(firstRect[0]) : 0;
    const sortIndex = `${String(pageIndex).padStart(5, '0')}|${String(yPos).padStart(6, '0')}|${String(xPos).padStart(5, '0')}`;

    // Create annotation using the Zotero Item API with all required properties
    const annotationItem = new Zotero.Item('annotation');
    annotationItem.libraryID = item.libraryID;
    annotationItem.parentID = item.id;
    annotationItem.annotationType = 'highlight';
    annotationItem.annotationText = selectedText;
    annotationItem.annotationComment = `[${semanticColor.name}]`; // Add semantic tag as comment
    annotationItem.annotationColor = semanticColor.color;
    annotationItem.annotationPosition = JSON.stringify(position);
    annotationItem.annotationPageLabel = pageLabel || '1';
    // Cast to any to work around type definition issue - sortIndex is actually a string
    (annotationItem as any).annotationSortIndex = sortIndex;

    const annotationID = await annotationItem.saveTx();

    ztoolkit.log("Annotation position:", JSON.stringify(position));
    ztoolkit.log("Annotation created:", annotationItem.id);
    ztoolkit.log(`Applied semantic color ${semanticColor.name} (${semanticColor.color}) to text: "${selectedText.substring(0, 50)}..."`);

    // Refresh the reader to show the new annotation
    reader.focus();
  } catch (error: any) {
    ztoolkit.log(`Error applying semantic color: ${error}`);
    new ztoolkit.ProgressWindow(config.addonName)
      .createLine({
        text: `Error applying color: ${error.message}`,
        type: "error"
      })
      .show();
  }
}

// Build semantic coloring popup elements for the PDF selection popup
export function buildSemanticColoringPopup(
  event: _ZoteroTypes.Reader.EventParams<"renderTextSelectionPopup">,
) {
  const { reader, doc, append } = event;
  const annotation = event.params.annotation;
  const popup = doc.querySelector(".selection-popup") as HTMLDivElement;

  ztoolkit.log("Building semantic coloring popup");

  // Capture the selected text and position for semantic coloring
  if (annotation) {
    if (annotation.text) {
      addon.data.semanticColors.selectedText = annotation.text;
      ztoolkit.log("Captured selected text:", annotation.text.substring(0, 50));
    }
    // Store the full annotation data including position
    if (annotation.position) {
      addon.data.semanticColors.pendingAnnotation = annotation;
      ztoolkit.log("Captured annotation position:", JSON.stringify(annotation.position));
    }
  } else {
    // Fallback: try to get selected text from the reader
    const internalReader = reader._internalReader;
    if (internalReader && (internalReader as any)._currentSelection) {
      const currentSelection = (internalReader as any)._currentSelection;
      if (currentSelection.text) {
        addon.data.semanticColors.selectedText = currentSelection.text;
        ztoolkit.log("Captured selected text from internal reader:", currentSelection.text.substring(0, 50));
      }
      if (currentSelection.position) {
        addon.data.semanticColors.pendingAnnotation = currentSelection;
        ztoolkit.log("Captured position from internal reader:", JSON.stringify(currentSelection.position));
      }
    }
  }

  // Create a container for semantic color buttons
  const semanticColorContainer = ztoolkit.UI.createElement(doc, "div", {
    tag: "div",
    id: `semantic-color-container-${reader._instanceID}`,
    classList: ["semantic-color-container"],
    styles: {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: "4px",
    },
    children: [
      // {
      //   tag: "div",
      //   styles: {
      //     fontWeight: "bold",
      //     fontSize: "12px",
      //     marginBottom: "4px",
      //     textAlign: "center",
      //   },
      //   properties: {
      //     innerText: "Semantic Colors:",
      //   },
      // },
      // Add semantic color buttons
      ...Object.entries(SEMANTIC_COLORS).map(([key, semanticColor]) => ({
        tag: "button",
        namespace: "html",
        id: `semantic-color-${key}-${reader._instanceID}`,
        styles: {
          backgroundColor: semanticColor.color,
          color: getContrastColor(semanticColor.color),
          border: "none",
          borderRadius: "4px",
          padding: "4px 8px",
          margin: "1px 0",
          cursor: "pointer",
          fontSize: "11px",
          textAlign: "center",
          width: "100%",
        },
        properties: {
          innerText: semanticColor.name,
          title: semanticColor.description,
        },
        listeners: [
          {
            type: "click",
            listener: async (ev: Event) => {
              ev.stopPropagation();
              ztoolkit.log(`Clicked semantic color: ${semanticColor.name} (${semanticColor.color})`);
              await applySemanticColor(reader, addon.data.semanticColors.selectedText, key, semanticColor);
              // Close the popup after selection
              if (popup) {
                popup.style.display = "none";
              }
            },
          },
        ],
      })),
    ],
  });

  // Append the semantic color container to the popup
  ztoolkit.log("Appending semantic color container to popup");
  append(semanticColorContainer);
}

// Update semantic coloring popup (currently just for consistency with the pattern)
export function updateSemanticColoringPopup() {
  // Currently not needed, but kept for consistency with the pattern
}

// Export an empty function to maintain compatibility
export function setupPDFSelectionCapture() {
  // This function is now handled by the onReaderPopupShow event in hooks.ts
  // This is kept for compatibility with the import in hooks.ts
}

// Helper function to determine text contrast color
function getContrastColor(hexColor: string): string {
  // Convert hex to RGB
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black or white depending on luminance
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}