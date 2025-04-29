// This plugin allows extracting variables and styles from a Figma document
// as JSON files for design system integration.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 450, height: 700 });

// Simple communication test - send a message as soon as the plugin loads
figma.ui.postMessage({
  type: 'plugin-loaded',
  message: 'Plugin has loaded successfully',
});

// When the plugin starts, send a message to UI with current selection
const currentSelection = figma.currentPage.selection;
figma.ui.postMessage({
  type: 'initial-selection',
  hasSelection: currentSelection.length > 0,
  selectionCount: currentSelection.length,
  selectionTypes: currentSelection.map((node) => node.type),
});

// Handle selection changes
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'selection-changed',
    hasSelection: selection.length > 0,
    selectionCount: selection.length,
    selectionTypes: selection.map((node) => node.type),
  });
});

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  console.log('Message received from UI:', msg.type);

  // Always reply with an echo
  figma.ui.postMessage({
    type: 'echo-reply',
    originalMessage: msg.type,
    timestamp: Date.now(),
  });

  if (msg.type === 'ping') {
    // Simple ping/pong to test communication
    figma.ui.postMessage({
      type: 'pong',
      timestamp: Date.now(),
    });
  } else if (msg.type === 'get-selection') {
    // Get current selection
    const selection = figma.currentPage.selection;
    figma.ui.postMessage({
      type: 'selection-info',
      selection: selection.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
      })),
    });
  } else if (msg.type === 'analyze-selection') {
    // Simple analysis that just returns basic info
    const selection = figma.currentPage.selection;

    if (selection.length === 1) {
      const node = selection[0];

      // Try to export a simple image if possible
      let imageData = null;
      try {
        if ('exportAsync' in node) {
          const bytes = await (node as ExportMixin).exportAsync({
            format: 'PNG',
            constraint: { type: 'WIDTH', value: 300 },
          });
          const base64 = figma.base64Encode(bytes);
          imageData = `data:image/png;base64,${base64}`;
        }
      } catch (e) {
        console.error('Export error:', e);
      }

      // Send basic node info
      figma.ui.postMessage({
        type: 'simple-analysis',
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        hasImage: !!imageData,
        imageData: imageData,
      });
    } else {
      figma.ui.postMessage({
        type: 'simple-analysis-error',
        message: `Please select exactly one node (current: ${selection.length})`,
      });
    }
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
