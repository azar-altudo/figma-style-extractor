// This plugin allows extracting variables and styles from a Figma document
// as JSON files for design system integration.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 450, height: 700 });

// Helper function to send debug messages to UI
function sendDebug(message: string) {
  console.log('DEBUG:', message);
  figma.ui.postMessage({
    type: 'debug-message',
    message: message,
  });
}

// Simple communication test - send a message as soon as the plugin loads
sendDebug('Plugin initialization started');
figma.ui.postMessage({
  type: 'plugin-loaded',
  message: 'Plugin has loaded successfully',
});

// Load variables and styles when plugin starts
try {
  sendDebug('Loading variables and styles...');
  loadAndDisplayVariables();
  loadAndDisplayStyles();
  sendDebug('Variables and styles loaded successfully');
} catch (e) {
  sendDebug(
    `Error loading initial data: ${
      e instanceof Error ? e.message : 'Unknown error'
    }`
  );
}

// When the plugin starts, send a message to UI with current selection
try {
  const currentSelection = figma.currentPage.selection;
  sendDebug(`Initial selection: ${currentSelection.length} items`);
  figma.ui.postMessage({
    type: 'initial-selection',
    hasSelection: currentSelection.length > 0,
    selectionCount: currentSelection.length,
    selectionTypes: currentSelection.map((node) => node.type),
  });
} catch (e) {
  sendDebug(
    `Error sending initial selection: ${
      e instanceof Error ? e.message : 'Unknown error'
    }`
  );
}

// Handle selection changes
figma.on('selectionchange', () => {
  try {
    const selection = figma.currentPage.selection;
    sendDebug(`Selection changed: ${selection.length} items selected`);
    figma.ui.postMessage({
      type: 'selection-changed',
      hasSelection: selection.length > 0,
      selectionCount: selection.length,
      selectionTypes: selection.map((node) => node.type),
    });
  } catch (e) {
    sendDebug(
      `Error in selection change handler: ${
        e instanceof Error ? e.message : 'Unknown error'
      }`
    );
  }
});

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  try {
    sendDebug(`Message received from UI: ${msg.type}`);

    // Always reply with an echo to confirm receipt
    figma.ui.postMessage({
      type: 'echo-reply',
      originalMessage: msg.type,
      timestamp: Date.now(),
    });

    if (msg.type === 'ping') {
      // Simple ping/pong to test communication
      sendDebug('Received ping, sending pong...');
      figma.ui.postMessage({
        type: 'pong',
        timestamp: Date.now(),
      });
    } else if (msg.type === 'get-selection') {
      // Get current selection
      sendDebug('Handling get-selection request');
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
      // Send debug message to confirm we're starting analysis
      sendDebug('Starting analyze-selection request processing');

      // Simple analysis that just returns basic info
      const selection = figma.currentPage.selection;

      sendDebug(`Selection has ${selection.length} items`);

      if (selection.length === 1) {
        const node = selection[0];
        sendDebug(`Analyzing node: ${node.name} (${node.type})`);

        // Try to export a simple image if possible
        let imageData = null;
        try {
          if ('exportAsync' in node) {
            sendDebug('Node can be exported, generating preview...');

            const bytes = await (node as ExportMixin).exportAsync({
              format: 'PNG',
              constraint: { type: 'WIDTH', value: 300 },
            });
            sendDebug('Export successful, encoding image...');

            const base64 = figma.base64Encode(bytes);
            imageData = `data:image/png;base64,${base64}`;

            sendDebug('Preview generated successfully');
          } else {
            sendDebug('Node cannot be exported (no exportAsync method)');
          }
        } catch (e) {
          sendDebug(
            `Export error: ${e instanceof Error ? e.message : 'Unknown error'}`
          );
          console.error('Export error:', e);
        }

        // Get styles used by the node
        const stylesInfo = getNodeStyles(node);
        sendDebug(`Found ${stylesInfo.length} styles used by this node`);

        // Get variables used by the node
        const variablesInfo = await getNodeVariables(node);
        sendDebug(`Found ${variablesInfo.length} variables used by this node`);

        // Send basic node info
        sendDebug('Sending analysis results to UI');
        figma.ui.postMessage({
          type: 'simple-analysis',
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          hasImage: !!imageData,
          imageData: imageData,
          styles: stylesInfo,
          variables: variablesInfo,
        });

        sendDebug('Analysis complete and sent to UI');
      } else {
        sendDebug(
          `Error: Need exactly one selected node (current: ${selection.length})`
        );
        figma.ui.postMessage({
          type: 'simple-analysis-error',
          message: `Please select exactly one node (current: ${selection.length})`,
        });
      }
    } else if (msg.type === 'extract-variables') {
      sendDebug('Extracting variables...');
      await extractVariables();
    } else if (msg.type === 'extract-styles') {
      sendDebug('Extracting styles...');
      await extractStyles();
    } else if (msg.type === 'export-frame-analysis') {
      sendDebug('Exporting frame analysis...');
      await exportFrameAnalysis();
    } else if (msg.type === 'cancel') {
      sendDebug('Closing plugin...');
      figma.closePlugin();
    } else {
      sendDebug(`Unknown message type received: ${msg.type}`);
    }
  } catch (e) {
    sendDebug(
      `ERROR in message handler: ${
        e instanceof Error ? e.message : 'Unknown error'
      }`
    );
    console.error('Error in message handler:', e);

    // Try to send an error message back to UI
    try {
      figma.ui.postMessage({
        type: 'plugin-error',
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    } catch {
      console.error('Failed to send error to UI');
    }
  }
};

// Helper function to pad strings (alternative to padStart)
function padString(str: string, length: number, char: string): string {
  while (str.length < length) {
    str = char + str;
  }
  return str;
}

async function loadAndDisplayVariables() {
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();

    const variablesData = variables.map((variable) => {
      const collection = collections.find(
        (c) => c.id === variable.variableCollectionId
      );
      return {
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        collectionName: collection?.name || 'Unknown Collection',
        values: variable.valuesByMode,
      };
    });

    figma.ui.postMessage({
      type: 'variables-data',
      variables: variablesData,
    });
  } catch (error) {
    console.error('Error loading variables:', error);
    figma.ui.postMessage({
      type: 'variables-error',
      message: 'Failed to load variables',
    });
  }
}

async function loadAndDisplayStyles() {
  try {
    // Get all styles in the document using async methods
    const paintStyles = await figma.getLocalPaintStylesAsync();
    const textStyles = await figma.getLocalTextStylesAsync();

    // Process paint styles
    const paintStylesData = paintStyles.map((style) => {
      const styleDetails = {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        hexColor: '',
        isComplex: false,
        color: null as { r: number; g: number; b: number; a: number } | null,
      };

      // Paint style (colors)
      if (style.paints.length > 0 && style.paints[0].type === 'SOLID') {
        const solidPaint = style.paints[0] as SolidPaint;
        styleDetails.color = {
          r: solidPaint.color.r,
          g: solidPaint.color.g,
          b: solidPaint.color.b,
          a: solidPaint.opacity !== undefined ? solidPaint.opacity : 1,
        };

        // Convert to hex
        const r = Math.round(solidPaint.color.r * 255);
        const g = Math.round(solidPaint.color.g * 255);
        const b = Math.round(solidPaint.color.b * 255);
        const a = solidPaint.opacity !== undefined ? solidPaint.opacity : 1;
        styleDetails.hexColor =
          '#' +
          padString(r.toString(16), 2, '0') +
          padString(g.toString(16), 2, '0') +
          padString(b.toString(16), 2, '0');

        if (a < 1) {
          const alpha = Math.round(a * 255);
          styleDetails.hexColor += padString(alpha.toString(16), 2, '0');
        }
      } else {
        styleDetails.isComplex = true;
      }

      return styleDetails;
    });

    // Process text styles
    const textStylesData = textStyles.map((style) => {
      return {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        fontName: style.fontName,
        fontSize: style.fontSize,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        paragraphIndent: style.paragraphIndent,
        paragraphSpacing: style.paragraphSpacing,
        textCase: style.textCase,
        textDecoration: style.textDecoration,
      };
    });

    // Combine both types of styles
    const stylesData = [...paintStylesData, ...textStylesData];

    figma.ui.postMessage({
      type: 'styles-data',
      styles: stylesData,
    });
  } catch (error) {
    console.error('Error loading styles:', error);
    figma.ui.postMessage({
      type: 'styles-error',
      message: 'Failed to load styles',
    });
  }
}

async function extractVariables() {
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();

    const variablesData = {
      collections: collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        modes: collection.modes,
      })),
      variables: variables.map((variable) => ({
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        collectionId: variable.variableCollectionId,
        values: variable.valuesByMode,
      })),
    };

    // Create a download link for the JSON file
    const jsonStr = JSON.stringify(variablesData, null, 2);

    // Use Figma's file system to save the file
    figma.ui.postMessage({
      type: 'download-file',
      content: jsonStr,
      filename: 'variables.json',
    });
  } catch (error) {
    console.error('Error extracting variables:', error);
    figma.ui.postMessage({
      type: 'extract-error',
      message: 'Failed to extract variables',
    });
  }
}

async function extractStyles() {
  try {
    // Get all styles in the document using async methods
    const paintStyles = await figma.getLocalPaintStylesAsync();
    const textStyles = await figma.getLocalTextStylesAsync();

    // Process paint styles
    const paintStylesData = paintStyles.map((style) => {
      const styleDetails = {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        hexColor: '',
        isComplex: false,
        color: null as { r: number; g: number; b: number; a: number } | null,
      };

      // Paint style (colors)
      if (style.paints.length > 0 && style.paints[0].type === 'SOLID') {
        const solidPaint = style.paints[0] as SolidPaint;
        styleDetails.color = {
          r: solidPaint.color.r,
          g: solidPaint.color.g,
          b: solidPaint.color.b,
          a: solidPaint.opacity !== undefined ? solidPaint.opacity : 1,
        };

        // Convert to hex
        const r = Math.round(solidPaint.color.r * 255);
        const g = Math.round(solidPaint.color.g * 255);
        const b = Math.round(solidPaint.color.b * 255);
        const a = solidPaint.opacity !== undefined ? solidPaint.opacity : 1;
        styleDetails.hexColor =
          '#' +
          padString(r.toString(16), 2, '0') +
          padString(g.toString(16), 2, '0') +
          padString(b.toString(16), 2, '0');

        if (a < 1) {
          const alpha = Math.round(a * 255);
          styleDetails.hexColor += padString(alpha.toString(16), 2, '0');
        }
      } else {
        styleDetails.isComplex = true;
      }

      return styleDetails;
    });

    // Process text styles
    const textStylesData = textStyles.map((style) => {
      return {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        fontName: style.fontName,
        fontSize: style.fontSize,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        paragraphIndent: style.paragraphIndent,
        paragraphSpacing: style.paragraphSpacing,
        textCase: style.textCase,
        textDecoration: style.textDecoration,
      };
    });

    // Combine both types of styles
    const stylesData = [...paintStylesData, ...textStylesData];

    // Create a download link for the JSON file
    const jsonStr = JSON.stringify(stylesData, null, 2);

    // Use Figma's file system to save the file
    figma.ui.postMessage({
      type: 'download-file',
      content: jsonStr,
      filename: 'styles.json',
    });
  } catch (error) {
    console.error('Error extracting styles:', error);
    figma.ui.postMessage({
      type: 'extract-error',
      message: 'Failed to extract styles',
    });
  }
}

// Helper function to get all styles used by a node (and its children)
function getNodeStyles(node: SceneNode): any[] {
  const styles: any[] = [];

  // Process paint styles (fill, stroke, etc.)
  if ('fillStyleId' in node && node.fillStyleId) {
    try {
      const styleIds = Array.isArray(node.fillStyleId)
        ? node.fillStyleId
        : [node.fillStyleId];

      for (const id of styleIds) {
        if (id) {
          const style = figma.getStyleById(id);
          if (style) {
            styles.push({
              id: style.id,
              name: style.name,
              type: style.type,
              key: style.key,
              description: style.description || '',
            });
          }
        }
      }
    } catch (e) {
      console.error('Error processing fill style:', e);
    }
  }

  // Direct color extraction from fills (even if not styles)
  if ('fills' in node && Array.isArray(node.fills)) {
    try {
      for (let i = 0; i < node.fills.length; i++) {
        const fill = node.fills[i];
        if (fill && fill.type === 'SOLID' && fill.visible !== false) {
          // Extract color information
          const r = Math.round(fill.color.r * 255);
          const g = Math.round(fill.color.g * 255);
          const b = Math.round(fill.color.b * 255);
          const a = fill.opacity !== undefined ? fill.opacity : 1;

          // Convert to hex
          const hexColor =
            '#' +
            padString(r.toString(16), 2, '0') +
            padString(g.toString(16), 2, '0') +
            padString(b.toString(16), 2, '0');

          styles.push({
            id: `color-${i}-${node.id}`,
            name: `Color ${hexColor}`,
            type: 'DIRECT_COLOR',
            hexColor: hexColor,
            opacity: (a * 100).toFixed(0) + '%',
            rgbValue: `rgb(${r}, ${g}, ${b})`,
          });
        }
      }
    } catch (e) {
      console.error('Error processing direct colors:', e);
    }
  }

  // Process stroke styles
  if ('strokeStyleId' in node && node.strokeStyleId) {
    try {
      const style = figma.getStyleById(node.strokeStyleId);
      if (style) {
        styles.push({
          id: style.id,
          name: style.name,
          type: style.type,
          key: style.key,
          description: style.description || '',
        });
      }
    } catch (e) {
      console.error('Error processing stroke style:', e);
    }
  }

  // Direct stroke color extraction
  if ('strokes' in node && Array.isArray(node.strokes)) {
    try {
      for (let i = 0; i < node.strokes.length; i++) {
        const stroke = node.strokes[i];
        if (stroke && stroke.type === 'SOLID' && stroke.visible !== false) {
          // Extract color information
          const r = Math.round(stroke.color.r * 255);
          const g = Math.round(stroke.color.g * 255);
          const b = Math.round(stroke.color.b * 255);
          const a = stroke.opacity !== undefined ? stroke.opacity : 1;

          // Convert to hex
          const hexColor =
            '#' +
            padString(r.toString(16), 2, '0') +
            padString(g.toString(16), 2, '0') +
            padString(b.toString(16), 2, '0');

          styles.push({
            id: `stroke-${i}-${node.id}`,
            name: `Stroke ${hexColor}`,
            type: 'DIRECT_STROKE',
            hexColor: hexColor,
            opacity: (a * 100).toFixed(0) + '%',
            rgbValue: `rgb(${r}, ${g}, ${b})`,
          });
        }
      }
    } catch (e) {
      console.error('Error processing direct stroke colors:', e);
    }
  }

  // Process text styles
  if ('textStyleId' in node && node.textStyleId) {
    try {
      const styleIds = Array.isArray(node.textStyleId)
        ? node.textStyleId
        : [node.textStyleId];

      for (const id of styleIds) {
        if (id) {
          const style = figma.getStyleById(id);
          if (style) {
            styles.push({
              id: style.id,
              name: style.name,
              type: style.type,
              key: style.key,
              description: style.description || '',
            });
          }
        }
      }
    } catch (e) {
      console.error('Error processing text style:', e);
    }
  }

  // Process effect styles
  if ('effectStyleId' in node && node.effectStyleId) {
    try {
      const style = figma.getStyleById(node.effectStyleId);
      if (style) {
        styles.push({
          id: style.id,
          name: style.name,
          type: style.type,
          key: style.key,
          description: style.description || '',
        });
      }
    } catch (e) {
      console.error('Error processing effect style:', e);
    }
  }

  // Process grid styles
  if ('gridStyleId' in node && node.gridStyleId) {
    try {
      const style = figma.getStyleById(node.gridStyleId);
      if (style) {
        styles.push({
          id: style.id,
          name: style.name,
          type: style.type,
          key: style.key,
          description: style.description || '',
        });
      }
    } catch (e) {
      console.error('Error processing grid style:', e);
    }
  }

  // If this is a frame or group, recursively process children
  if ('children' in node) {
    for (const child of node.children) {
      styles.push(...getNodeStyles(child));
    }
  }

  // Remove duplicates by ID
  const uniqueStyles = [];
  const seenIds = new Set();

  for (const style of styles) {
    if (!seenIds.has(style.id)) {
      seenIds.add(style.id);
      uniqueStyles.push(style);
    }
  }

  return uniqueStyles;
}

// Helper function to get all variables used by a node (and its children)
async function getNodeVariables(node: SceneNode): Promise<any[]> {
  const variables: any[] = [];
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  // Check if node has bound variables
  try {
    if ('boundVariables' in node) {
      const boundVars = node.boundVariables as Record<string, any>;

      if (boundVars) {
        // Safely iterate through all properties
        for (const property in boundVars) {
          if (Object.prototype.hasOwnProperty.call(boundVars, property)) {
            const bound = boundVars[property];

            // Handle single variable binding
            if (bound && typeof bound === 'object' && 'id' in bound) {
              try {
                const varId = bound.id;
                const variable = await figma.variables.getVariableByIdAsync(
                  varId
                );

                if (variable) {
                  const collection = collections.find(
                    (c) => c.id === variable.variableCollectionId
                  );
                  variables.push({
                    id: variable.id,
                    name: variable.name,
                    type: variable.resolvedType,
                    collectionName: collection?.name || 'Unknown Collection',
                    property: property,
                  });
                }
              } catch (e) {
                console.error('Error processing variable:', e);
              }
            }

            // Handle array of variable bindings
            else if (bound && Array.isArray(bound)) {
              for (const binding of bound) {
                try {
                  if (
                    binding &&
                    typeof binding === 'object' &&
                    'id' in binding
                  ) {
                    const varId = binding.id;
                    const variable = await figma.variables.getVariableByIdAsync(
                      varId
                    );

                    if (variable) {
                      const collection = collections.find(
                        (c) => c.id === variable.variableCollectionId
                      );
                      variables.push({
                        id: variable.id,
                        name: variable.name,
                        type: variable.resolvedType,
                        collectionName:
                          collection?.name || 'Unknown Collection',
                        property: property,
                      });
                    }
                  }
                } catch (e) {
                  console.error('Error processing variable in array:', e);
                }
              }
            }
          }
        }
      }
    }

    // Special check for paint variables
    if ('fills' in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill && fill.type === 'SOLID' && fill.boundVariables) {
          // Check for color variable
          if (fill.boundVariables.color) {
            try {
              const varId = fill.boundVariables.color.id;
              const variable = await figma.variables.getVariableByIdAsync(
                varId
              );

              if (variable) {
                const collection = collections.find(
                  (c) => c.id === variable.variableCollectionId
                );
                variables.push({
                  id: variable.id,
                  name: variable.name,
                  type: variable.resolvedType,
                  collectionName: collection?.name || 'Unknown Collection',
                  property: 'fill.color',
                });
              }
            } catch (e) {
              console.error('Error processing fill color variable:', e);
            }
          }
          // Check for opacity variable
          if (fill.boundVariables.opacity) {
            try {
              const varId = fill.boundVariables.opacity.id;
              const variable = await figma.variables.getVariableByIdAsync(
                varId
              );

              if (variable) {
                const collection = collections.find(
                  (c) => c.id === variable.variableCollectionId
                );
                variables.push({
                  id: variable.id,
                  name: variable.name,
                  type: variable.resolvedType,
                  collectionName: collection?.name || 'Unknown Collection',
                  property: 'fill.opacity',
                });
              }
            } catch (e) {
              console.error('Error processing fill opacity variable:', e);
            }
          }
        }
      }
    }

    // Check stroke properties
    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke && stroke.type === 'SOLID' && stroke.boundVariables) {
          // Check for color variable
          if (stroke.boundVariables.color) {
            try {
              const varId = stroke.boundVariables.color.id;
              const variable = await figma.variables.getVariableByIdAsync(
                varId
              );

              if (variable) {
                const collection = collections.find(
                  (c) => c.id === variable.variableCollectionId
                );
                variables.push({
                  id: variable.id,
                  name: variable.name,
                  type: variable.resolvedType,
                  collectionName: collection?.name || 'Unknown Collection',
                  property: 'stroke.color',
                });
              }
            } catch (e) {
              console.error('Error processing stroke color variable:', e);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error processing all variables:', e);
  }

  // If this is a frame or group, recursively process children
  if ('children' in node) {
    for (const child of node.children) {
      try {
        const childVars = await getNodeVariables(child);
        variables.push(...childVars);
      } catch (e) {
        console.error('Error processing child node variables:', e);
      }
    }
  }

  // Remove duplicates by ID
  const uniqueVariables = [];
  const seenIds = new Set();

  for (const variable of variables) {
    if (!seenIds.has(variable.id)) {
      seenIds.add(variable.id);
      uniqueVariables.push(variable);
    }
  }

  return uniqueVariables;
}

// Function to export styles and variables for the selected frame/layer
async function exportFrameAnalysis() {
  try {
    const selection = figma.currentPage.selection;

    if (selection.length !== 1) {
      figma.ui.postMessage({
        type: 'extract-error',
        message: 'Please select exactly one layer for export',
      });
      return;
    }

    const node = selection[0];
    sendDebug(`Exporting analysis for ${node.name} (${node.type})`);

    // Get styles used by the node
    const stylesInfo = getNodeStyles(node);
    sendDebug(`Found ${stylesInfo.length} styles used by this node`);

    // Get variables used by the node
    const variablesInfo = await getNodeVariables(node);
    sendDebug(`Found ${variablesInfo.length} variables used by this node`);

    // Create JSON data
    const analysisData = {
      nodeInfo: {
        id: node.id,
        name: node.name,
        type: node.type,
      },
      styles: stylesInfo,
      variables: variablesInfo,
    };

    // Create a download link for the JSON file
    const jsonStr = JSON.stringify(analysisData, null, 2);
    const filename = `${node.name
      .replace(/\s+/g, '-')
      .toLowerCase()}-analysis.json`;

    // Use Figma's file system to save the file
    figma.ui.postMessage({
      type: 'download-file',
      content: jsonStr,
      filename: filename,
    });

    sendDebug(`Analysis exported successfully as ${filename}`);
  } catch (error) {
    console.error('Error exporting frame analysis:', error);
    figma.ui.postMessage({
      type: 'extract-error',
      message: 'Failed to export frame analysis',
    });
  }
}
