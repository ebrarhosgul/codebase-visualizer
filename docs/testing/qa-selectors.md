# QA Automation Selector Guide

Welcome to the end to end testing reference guide for Codebase Visualizer. This document provides you with a complete catalog of deterministic `data-testid` selectors and semantic state attributes across the application. You can use these locators in Playwright or any automated testing framework without relying on fragile CSS structure or text content.

## Selector Reference Catalog

| Component / Path | Element Description | `data-testid` & State Attributes | Interaction Type | Primary Use Case in E2E |
| --- | --- | --- | --- | --- |
| `src/components/workspace/repo-submission-bar.tsx` | Repository URL input field | `data-testid="repo-url-input"` | Type | Enter public GitHub repository identifier |
| `src/components/workspace/repo-submission-bar.tsx` | Branch input field | `data-testid="repo-branch-input"` | Type | Specify custom branch name or commit SHA |
| `src/components/workspace/repo-submission-bar.tsx` | Analyze submission button | `data-testid="submit-analyze-btn"` | Click | Trigger repository download and AST parsing pipeline |
| `src/components/workspace/repo-submission-bar.tsx` | Cancel analysis button | `data-testid="cancel-analyze-btn"` | Click | Cancel active in flight ingestion stream |
| `src/components/workspace/repo-submission-bar.tsx` | Force refresh button | `data-testid="force-refresh-btn"` | Click | Invalidate cache and trigger fresh extraction |
| `src/components/workspace/repo-submission-bar.tsx` | Share workspace button | `data-testid="share-workspace-btn"` | Click | Copy workspace permalink to clipboard |
| `src/components/workspace/repo-submission-bar.tsx` | GitHub token drawer toggle | `data-testid="github-token-btn"` | Click | Open personal access token configuration drawer |
| `src/components/workspace/repo-submission-bar.tsx` | GitHub token input field | `data-testid="github-token-input"` | Type | Enter personal access token for higher rate limits |
| `src/components/workspace/repo-submission-bar.tsx` | Save GitHub token button | `data-testid="save-token-btn"` | Click | Persist encrypted token cookie |
| `src/components/workspace/repo-submission-bar.tsx` | Clear GitHub token button | `data-testid="clear-token-btn"` | Click | Remove stored token cookie |
| `src/components/workspace/repo-submission-bar.tsx` | Close token drawer button | `data-testid="close-token-drawer-btn"` | Click | Dismiss token drawer |
| `src/components/workspace/repo-submission-bar.tsx` | Token validation error alert | `data-testid="token-error-message"` | Assert State | Validate bad credentials or token validation errors |
| `src/components/workspace/repo-submission-bar.tsx` | Ingestion progress indicator | `data-testid="ingestion-progress-indicator"` `data-phase="clone" \| "ast" \| "layout" \| "complete"` `data-progress={percentage}` | Assert State | Observe live streaming progress across ingestion phases |
| `src/components/workspace/repo-submission-bar.tsx` | Demo repository shortcut pills | `data-testid="demo-repo-btn-${name}"` | Click | Load quick sample repositories like react or nextjs |
| `src/components/workspace/rate-limit-dialog.tsx` | Rate limit dialog container | `data-testid="rate-limit-dialog"` | Assert State | Assert GitHub or AI rate limit modal activation |
| `src/components/workspace/rate-limit-dialog.tsx` | Rate limit confirm button | `data-testid="rate-limit-confirm-btn"` | Click | Acknowledge limit dialog or proceed with action |
| `src/components/workspace/rate-limit-dialog.tsx` | Rate limit cancel button | `data-testid="rate-limit-cancel-btn"` | Click | Dismiss rate limit warning modal |
| `src/components/workspace/rate-limit-dialog.tsx` | Rate limit retry button | `data-testid="rate-limit-retry-btn"` | Click | Retry request after wait interval |
| `src/components/ui/dialog.tsx` | Dialog primitive wrapper | `data-testid={testId}` | Assert State | Locate accessible modal dialog surfaces |
| `src/components/ui/tabs.tsx` | Tab trigger buttons | `data-testid="tab-trigger-${value}"` | Click | Select active view in tabbed panels |
| `src/components/ui/tabs.tsx` | Tab content container | `data-testid="tab-content-${value}"` | Assert State | Assert tab panel content activation |
| `src/components/ui/toast.tsx` | Toast notification card | `data-testid="toast-root"` `data-variant="default" \| "success" \| "error"` | Assert State | Assert transient feedback notification popups |
| `src/components/ui/toast.tsx` | Toast message content | `data-testid="toast-message"` | Assert State | Verify toast notification message strings |
| `src/components/ui/toast.tsx` | Toast dismiss button | `data-testid="toast-dismiss-btn"` | Click | Dismiss toast banner prematurely |
| `src/components/ui/dropdown-menu.tsx` | Dropdown menu container | `data-testid="dropdown-menu-content"` | Assert State | Verify dropdown menu panel display |
| `src/components/ui/dropdown-menu.tsx` | Dropdown menu option | `data-testid="dropdown-item-${id}"` | Click | Select specific dropdown action item |
| `src/components/layout/workspace-layout.tsx` | Workspace layout root | `data-testid="workspace-root"` `data-layout-mode="desktop" \| "mobile"` | Assert State | Validate desktop or mobile viewport layout mounting |
| `src/components/layout/workspace-layout.tsx` | Explorer sidebar panel | `data-testid="explorer-sidebar"` `data-collapsed={boolean}` | Assert State | Verify left navigation sidebar visibility and collapse |
| `src/components/layout/workspace-layout.tsx` | Inspector right panel | `data-testid="inspector-sidebar"` `data-collapsed={boolean}` | Assert State | Verify right inspector sidebar visibility and collapse |
| `src/components/layout/workspace-layout.tsx` | Collapse left sidebar button | `data-testid="collapse-left-sidebar-btn"` | Click | Collapse left explorer sidebar |
| `src/components/layout/workspace-layout.tsx` | Expand left sidebar button | `data-testid="expand-left-sidebar-btn"` | Click | Expand left explorer sidebar |
| `src/components/layout/workspace-layout.tsx` | Collapse right panel button | `data-testid="collapse-right-panel-btn"` | Click | Collapse right inspector and code panel |
| `src/components/layout/workspace-layout.tsx` | Expand right panel button | `data-testid="expand-right-panel-btn"` | Click | Expand right inspector and code panel |
| `src/components/layout/workspace-layout.tsx` | Mobile bottom navigation bar | `data-testid="mobile-bottom-nav"` | Assert State | Detect mobile tab bar on small viewports |
| `src/components/layout/workspace-layout.tsx` | Mobile tab switch button | `data-testid="mobile-view-btn-${id}"` | Click | Switch active screen in mobile responsive mode |
| `src/components/layout/resizable-split-pane.tsx` | Split pane container | `data-testid="resizable-split-pane"` `data-orientation="horizontal" \| "vertical"` | Assert State | Verify split pane orientation and sizing |
| `src/components/layout/resizable-split-pane.tsx` | Split pane panel viewport | `data-testid="split-pane-panel-${id}"` | Assert State | Target individual pane surfaces for bounds checks |
| `src/components/layout/resizable-split-pane.tsx` | Split pane divider bar | `data-testid="split-pane-resizer-${id}"` `data-resizer-id={id}` | Drag | Drag splitter handle to resize adjacent panels |
| `src/app/page.tsx` | Tree file filter input | `data-testid="file-search-input"` | Type | Filter folder tree rows by filename keyword |
| `src/components/workspace/folder-tree.tsx` | Folder tree view container | `data-testid="folder-tree-container"` | Assert State | Validate directory tree mounting |
| `src/components/workspace/folder-tree.tsx` | Directory tree row | `data-testid="tree-dir-${id}"` `data-expanded={boolean}` | Click | Expand or collapse directory branch in tree |
| `src/components/workspace/folder-tree.tsx` | File tree row | `data-testid="tree-file-${id}"` `data-active={boolean}` `data-is-code={boolean}` | Click | Select target file to open in viewer and highlight on canvas |
| `src/components/workspace/folder-tree.tsx` | Toggle all files view | `data-testid="tree-toggle-all-files"` | Click | Toggle visibility of non code assets in tree |
| `src/components/workspace/folder-tree.tsx` | Expand all folders button | `data-testid="tree-expand-all"` | Click | Recursively expand all folder branches |
| `src/components/workspace/folder-tree.tsx` | Collapse all folders button | `data-testid="tree-collapse-all"` | Click | Recursively collapse all folder branches |
| `src/components/workspace/node-inspector.tsx` | Node inspector panel | `data-testid="node-inspector"` | Assert State | Assert active entity inspector container |
| `src/components/workspace/node-inspector.tsx` | Hidden node alert banner | `data-testid="node-hidden-warning"` | Assert State | Detect when selected entity is filtered out of view |
| `src/components/workspace/node-inspector.tsx` | Reveal hidden node button | `data-testid="inspector-reveal-node-btn"` | Click | Clear layer filters that hide the selected entity |
| `src/components/workspace/node-inspector.tsx` | Reset filters from inspector | `data-testid="inspector-reset-filters-btn"` | Click | Reset all canvas filters from inspector panel |
| `src/components/workspace/node-inspector.tsx` | Constituent file link | `data-testid="constituent-file-${id}"` | Click | Select constituent file belonging to directory cluster |
| `src/components/workspace/node-inspector.tsx` | Inbound dependency link | `data-testid="inbound-dep-${id}"` | Click | Navigate to incoming caller file |
| `src/components/workspace/node-inspector.tsx` | Outbound dependency link | `data-testid="outbound-dep-${id}"` | Click | Navigate to outbound imported module |
| `src/components/workspace/node-inspector.tsx` | Symbol entry row | `data-testid="inspector-symbol-${id}"` | Click | Jump to symbol declaration line in Monaco editor |
| `src/components/canvas/architecture-canvas.tsx` | React Flow canvas container | `data-testid="architecture-canvas"` | Assert State | Target graph canvas viewport for interactions |
| `src/components/canvas/architecture-canvas.tsx` | Canvas empty welcome state | `data-testid="workspace-empty-state"` | Assert State | Verify welcome state before repository ingestion |
| `src/components/canvas/architecture-canvas.tsx` | Filtered empty state banner | `data-testid="canvas-filtered-empty-state"` | Assert State | Assert zero nodes visible when all are filtered out |
| `src/components/canvas/architecture-canvas.tsx` | Canvas empty demo repo shortcut | `data-testid="demo-repo-btn-${name}"` | Click | Ingest demo repository from canvas welcome view |
| `src/components/canvas/architecture-canvas.tsx` | Background layout error alert | `data-testid="canvas-layout-error"` | Assert State | Catch layout calculation failure notifications |
| `src/components/canvas/custom-minimap.tsx` | Canvas overview minimap | `data-testid="canvas-minimap"` | Assert State | Confirm minimap component renders |
| `src/components/canvas/graph-controls-toolbar.tsx` | Camera controls toolbar | `data-testid="graph-controls-toolbar"` | Assert State | Locate floating canvas camera toolbar |
| `src/components/canvas/graph-controls-toolbar.tsx` | Worker calculating spinner | `data-testid="layout-calculating-indicator"` | Assert State | Wait for background Dagre layout computation to finish |
| `src/components/canvas/graph-controls-toolbar.tsx` | Zoom in button | `data-testid="zoom-in-btn"` | Click | Zoom in on architecture map |
| `src/components/canvas/graph-controls-toolbar.tsx` | Zoom out button | `data-testid="zoom-out-btn"` | Click | Zoom out on architecture map |
| `src/components/canvas/graph-controls-toolbar.tsx` | Fit view button | `data-testid="fit-view-btn"` | Click | Fit entire architecture graph within viewport bounds |
| `src/components/canvas/graph-controls-toolbar.tsx` | Reset view button | `data-testid="reset-view-btn"` | Click | Reset camera zoom and position to center |
| `src/components/canvas/graph-controls-toolbar.tsx` | Follow cursor toggle button | `data-testid="toggle-follow-cursor-btn"` | Click | Toggle canvas auto pan following Monaco editor cursor |
| `src/components/canvas/graph-controls-toolbar.tsx` | Toggle minimap button | `data-testid="toggle-minimap-btn"` | Click | Show or hide floating minimap |
| `src/components/canvas/layer-filter-bar.tsx` | Layer filter bar container | `data-testid="layer-filter-bar"` | Assert State | Locate architectural layer filter toolbar |
| `src/components/canvas/layer-filter-bar.tsx` | Canvas search input | `data-testid="canvas-search-input"` | Type | Debounced search across modules and symbols |
| `src/components/canvas/layer-filter-bar.tsx` | Clear search button | `data-testid="clear-search-btn"` | Click | Clear active canvas search filter |
| `src/components/canvas/layer-filter-bar.tsx` | Architectural layer chip | `data-testid="layer-chip-${layerId}"` `data-layer-active={boolean}` | Click | Filter canvas entities by layer type |
| `src/components/canvas/layer-filter-bar.tsx` | Clear layer filters button | `data-testid="clear-layer-filters"` | Click | Clear all active layer toggles |
| `src/components/canvas/layer-filter-bar.tsx` | Collapse all folders button | `data-testid="collapse-all-folders"` | Click | Collapse directories into aggregated folder summary cards |
| `src/components/canvas/layer-filter-bar.tsx` | Expand all folders button | `data-testid="expand-all-folders"` | Click | Expand all folders back into individual file cards |
| `src/components/canvas/layer-filter-bar.tsx` | Toggle external modules button | `data-testid="toggle-hide-external"` | Click | Hide or show external third party dependencies |
| `src/components/canvas/layer-filter-bar.tsx` | Reset all filters button | `data-testid="reset-filters-btn"` | Click | Reset all layers, search query, and folder collapses |
| `src/components/canvas/file-node-card.tsx` | File node card | `data-testid="canvas-node-file-${id}"` `data-node-id={id}` `data-selected={boolean}` | Click | Inspect file card and trigger code editor viewing |
| `src/components/canvas/symbol-node-card.tsx` | Symbol node card | `data-testid="canvas-node-symbol-${id}"` `data-node-id={id}` `data-selected={boolean}` | Click | Inspect declaration and highlight in Monaco |
| `src/components/canvas/folder-group-node.tsx` | Folder group cluster | `data-testid="folder-group-${label}"` `data-node-id={id}` `data-active={boolean}` | Assert State | Verify boundary and active state of directory cluster |
| `src/components/canvas/folder-group-node.tsx` | Folder group collapse button | `data-testid="folder-collapse-${label}"` | Click | Collapse folder cluster into compact card |
| `src/components/canvas/collapsed-folder-node.tsx` | Collapsed folder summary card | `data-testid="collapsed-folder-${label}"` `data-node-id={id}` `data-selected={boolean}` | Click | Inspect directory summary or double click to expand |
| `src/components/canvas/collapsed-folder-node.tsx` | Folder card expand button | `data-testid="folder-expand-${label}"` | Click | Expand folder card back into detailed files |
| `src/components/editor/code-viewer.tsx` | Code viewer container | `data-testid="code-viewer-container"` | Assert State | Verify side by side code panel mounting |
| `src/components/editor/code-viewer.tsx` | Editor empty state prompt | `data-testid="code-viewer-empty"` | Assert State | Assert empty state when no file is selected |
| `src/components/editor/code-viewer.tsx` | Active file path breadcrumb | `data-testid="code-viewer-filepath"` | Assert State | Verify file path header string |
| `src/components/editor/code-viewer.tsx` | Share deep link button | `data-testid="share-permalink-btn"` | Click | Copy current file and line permalink to clipboard |
| `src/components/editor/code-viewer.tsx` | Monaco editor canvas wrapper | `data-testid="monaco-editor-wrapper"` | Assert State | Locate Monaco code viewport for canvas synchronization |
| `src/components/editor/code-viewer.tsx` | Highlighted code line indicator | `data-testid="code-line-highlighted"` `data-line-number={line}` | Assert State | Verify active line number during deep link transitions |
| `src/components/trace/trace-panel.tsx` | Suggested prompt chip | `data-testid="prompt-chip-${index}"` | Click | Populate query input with sample architectural question |
| `src/components/trace/trace-panel.tsx` | AI trace query input | `data-testid="trace-chat-input"` | Type | Enter natural language query for architecture reasoning |
| `src/components/trace/trace-panel.tsx` | Submit query button | `data-testid="trace-submit-btn"` | Click | Send architecture query to AI streaming endpoint |
| `src/components/trace/trace-panel.tsx` | Stop response button | `data-testid="trace-stop-btn"` | Click | Abort in flight AI stream generation |
| `src/components/trace/trace-panel.tsx` | Chat messages thread container | `data-testid="chat-messages-container"` | Assert State | Locate message history list |
| `src/components/trace/trace-panel.tsx` | User message bubble | `data-testid="chat-message-user"` | Assert State | Assert user prompt content in thread |
| `src/components/trace/trace-panel.tsx` | Assistant message bubble | `data-testid="chat-message-assistant"` `data-status="streaming" \| "complete" \| "error"` | Assert State | Assert assistant response content and streaming phase |
| `src/components/trace/trace-panel.tsx` | Copy response button | `data-testid="copy-response-btn"` | Click | Copy assistant message text to clipboard |
| `src/components/trace/trace-panel.tsx` | Path trace step pill | `data-testid="path-trace-step-${index}"` | Click | Focus specific hop along verified dependency route |
| `src/components/trace/trace-panel.tsx` | Highlight trace button | `data-testid="highlight-trace-btn"` | Click | Highlight active dependency path edges on canvas |
| `src/components/trace/trace-panel.tsx` | Citations list container | `data-testid="ai-citations-list"` | Assert State | Verify code citations section in assistant reply |
| `src/components/trace/trace-panel.tsx` | Citation item link button | `data-testid="citation-${filePath}"` | Click | Jump to cited file and line in editor and canvas |
| `src/components/trace/trace-panel.tsx` | Demo mode answer disclaimer | `data-testid="demo-answer-footer"` | Assert State | Assert offline demo mode disclosure banner |
| `src/components/trace/markdown-message.tsx` | Inline markdown citation badge | `data-testid="ai-citation-link"` `data-testid="citation-${filePath}"` `data-citation-path={filePath}` | Click | Jump directly to file when cited inside markdown response |
| `src/components/trace/fallback-notice-card.tsx` | AI fallback notice card | `data-testid="fallback-notice-card"` `data-notice-code={code}` | Assert State | Assert rate limit or service outage fallback card |
| `src/components/trace/fallback-notice-card.tsx` | Open key settings recovery button | `data-testid="fallback-key-settings-btn"` | Click | Open BYOK key configuration dialog from error card |
| `src/components/trace/fallback-notice-card.tsx` | Switch to demo mode button | `data-testid="fallback-switch-demo-btn"` | Click | Switch from live API error to zero cost offline demo mode |
| `src/components/trace/fallback-notice-card.tsx` | Retry query button | `data-testid="fallback-retry-btn"` | Click | Retry query immediately after rate limit pause |
| `src/components/trace/key-settings-dialog.tsx` | Key settings dialog container | `data-testid="key-settings-dialog"` | Assert State | Locate BYOK configuration dialog surface |
| `src/components/trace/key-settings-dialog.tsx` | Provider radio option | `data-testid="provider-radio-${providerId}"` `data-selected={boolean}` | Click | Select AI provider between Gemini, OpenAI, or Claude |
| `src/components/trace/key-settings-dialog.tsx` | API key input field | `data-testid="api-key-input"` | Type | Enter provider API secret key |
| `src/components/trace/key-settings-dialog.tsx` | Clear stored key button | `data-testid="clear-key-btn"` | Click | Remove stored key cookie |
| `src/components/trace/key-settings-dialog.tsx` | Close key dialog button | `data-testid="close-key-dialog-btn"` | Click | Dismiss key settings dialog without saving |
| `src/components/trace/key-settings-dialog.tsx` | Save encrypted key button | `data-testid="save-key-btn"` | Click | Save encrypted key in browser cookie |
