import { plugin, method } from '@plexus/rpc'
import { Type } from '@sinclair/typebox'
import { forwardToBridge } from './bridge-connection'
import { screenshot, isHeadlessReady } from './headless'

// Bridge-forwarding method factory — passes all calls through to the Vue app.
// forwardToBridge yields plain content values; the @plexus/rpc server wraps them
// in subscription data items before sending to external callers.
//
// For non-streaming (mutation) methods, a screenshot is taken automatically
// after the call completes so callers can see the result without a separate step.
function bridgeMethod(
  fullMethodName: string,
  description: string,
  paramsSchema: ReturnType<typeof Type.Object>,
  opts: { streaming?: boolean; screenshot?: boolean } = {},
) {
  const { streaming = false, screenshot: doScreenshot = !streaming } = opts
  return method({
    description,
    streaming,
    params: paramsSchema,
    async *run(params) {
      yield* forwardToBridge(fullMethodName, params)
      if (doScreenshot && isHeadlessReady()) {
        // Small delay for Vue to finish rendering the state change
        await new Promise(r => setTimeout(r, 300))
        const path = await screenshot(fullMethodName.replace(/\./g, '-'))
        console.log(`[headless] screenshot: ${path}`)
      }
    },
  })
}

const palettePlugin = plugin('palette', {
  version: '0.1.0',
  description: 'Command palette control',
  methods: {
    open:  bridgeMethod('ui.palette.open',  'Open the command palette',  Type.Object({})),
    close: bridgeMethod('ui.palette.close', 'Close the command palette', Type.Object({})),
  },
})

const uiPlugin = plugin('ui', {
  version: '0.1.0',
  description: 'UI navigation and theme',
  children: [palettePlugin],
  methods: {
    navigate:  bridgeMethod('ui.navigate',  'Switch to a view tab',                                        Type.Object({ view: Type.String() })),
    getView:   bridgeMethod('ui.getView',   'Get current view name',                                       Type.Object({}), { screenshot: false }),
    setTheme:  bridgeMethod('ui.setTheme',  'Set UI theme',                                                Type.Object({ theme: Type.String() })),
    getTheme:  bridgeMethod('ui.getTheme',  'Get current theme',                                           Type.Object({}), { screenshot: false }),
    focusPath: bridgeMethod('ui.focusPath', 'Navigate to a specific backend path in the explorer',
      Type.Object({ backend: Type.String(), path: Type.Optional(Type.Array(Type.String())) })),
  },
})

const backendsPlugin = plugin('backends', {
  version: '0.1.0',
  description: 'Backend connection management',
  methods: {
    list:      bridgeMethod('backends.list',      'List all connected backends',           Type.Object({}), { screenshot: false }),
    add:       bridgeMethod('backends.add',       'Add a new backend connection',          Type.Object({ name: Type.String(), url: Type.String() })),
    remove:    bridgeMethod('backends.remove',    'Remove a backend connection',           Type.Object({ name: Type.String() })),
    setActive: bridgeMethod('backends.setActive', 'Set the active backend',               Type.Object({ name: Type.String() })),
    health:    bridgeMethod('backends.health',    'Get health status of all backends',     Type.Object({}), { screenshot: false }),
    methods:   bridgeMethod('backends.methods',   'List all known methods across backends', Type.Object({}), { screenshot: false }),
  },
})

const invokePlugin = plugin('invoke', {
  version: '0.1.0',
  description: 'Remote method invocation through the UI',
  methods: {
    call: bridgeMethod(
      'invoke.call',
      'Invoke a method on a connected backend, optionally navigating to it in the UI',
      Type.Object({
        backend: Type.String(),
        method:  Type.String(),
        params:  Type.Optional(Type.Unknown()),
        visible: Type.Optional(Type.Boolean()),
      }),
      { streaming: true },
    ),
    batch: bridgeMethod(
      'invoke.batch',
      'Invoke a method N times in parallel and return all results',
      Type.Object({
        backend:     Type.String(),
        method:      Type.String(),
        items:       Type.Array(Type.Unknown(), { description: 'Array of param objects' }),
        concurrency: Type.Optional(Type.Number({ minimum: 1, maximum: 20, default: 4 })),
      }),
    ),
  },
})

const statePlugin = plugin('state', {
  version: '0.1.0',
  description: 'Live UI state subscription',
  methods: {
    watch: bridgeMethod('state.watch', 'Stream live UI state change events', Type.Object({}), { streaming: true }),
  },
})

const wiringPlugin = plugin('wiring', {
  version: '0.1.0',
  description: 'Method wiring canvas control (available when wiring view is active)',
  methods: {
    addMethod:    bridgeMethod('wiring.addMethod',    'Add a method node to the canvas',
      Type.Object({ backend: Type.String(), method: Type.String(), x: Type.Optional(Type.Number()), y: Type.Optional(Type.Number()) })),
    addTransform: bridgeMethod('wiring.addTransform',
      'Add a node. kind: extract|template|merge|script|vars|layout|widget. ' +
      'subkind (widget): text|input|button|slider|table. orientation (layout): row|col',
      Type.Object({
        kind: Type.Union([
          Type.Literal('extract'), Type.Literal('template'), Type.Literal('merge'),
          Type.Literal('script'),  Type.Literal('vars'),     Type.Literal('layout'),
          Type.Literal('widget'),
        ]),
        subkind: Type.Optional(Type.Union([
          Type.Literal('text'), Type.Literal('input'), Type.Literal('button'),
          Type.Literal('slider'), Type.Literal('table'),
        ])),
        orientation: Type.Optional(Type.Union([
          Type.Literal('row'), Type.Literal('col'),
        ])),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
      })),
    connectNodes: bridgeMethod('wiring.connectNodes', 'Connect two nodes with an edge',
      Type.Object({ fromNodeId: Type.String(), toNodeId: Type.String(), toParam: Type.Optional(Type.String()) })),
    removeEdge:   bridgeMethod('wiring.removeEdge',   'Remove an edge by ID',                      Type.Object({ edgeId: Type.String() })),
    deleteNode:   bridgeMethod('wiring.deleteNode',   'Delete a node and its edges',               Type.Object({ nodeId: Type.String() })),
    setNodeParams: bridgeMethod('wiring.setNodeParams', 'Set parameters on a node',
      Type.Object({ nodeId: Type.String(), params: Type.Record(Type.String(), Type.Unknown()) })),
    setNodeLabel: bridgeMethod('wiring.setNodeLabel', 'Set the display label of a node',          Type.Object({ nodeId: Type.String(), label: Type.String() })),
    setEdgeRouting: bridgeMethod('wiring.setEdgeRouting', 'Change edge routing strategy',
      Type.Object({ edgeId: Type.String(), mode: Type.String() })),
    selectNode:   bridgeMethod('wiring.selectNode',   'Select a node (opens param panel)',         Type.Object({ nodeId: Type.String() }), { screenshot: true }),
    runNode:      bridgeMethod('wiring.runNode',      'Run a specific node and optionally downstream',
      Type.Object({ nodeId: Type.String(), downstream: Type.Optional(Type.Boolean()) })),
    getResults:   bridgeMethod('wiring.getResults',   'Get all node execution results',            Type.Object({}), { screenshot: false }),
    run:          bridgeMethod('wiring.run',          'Execute the full wiring pipeline',          Type.Object({})),
    clear:        bridgeMethod('wiring.clear',        'Clear all nodes and edges',                 Type.Object({})),
    getJson:      bridgeMethod('wiring.getJson',      'Export pipeline as JSON',                   Type.Object({}), { screenshot: false }),
    importJson:   bridgeMethod('wiring.importJson',   'Import pipeline from JSON string',          Type.Object({ json: Type.String() })),
    getState:     bridgeMethod('wiring.getState',     'Get canvas summary (node/edge counts)',     Type.Object({}), { screenshot: false }),
    undo:         bridgeMethod('wiring.undo',         'Undo last canvas change',                   Type.Object({})),
    redo:         bridgeMethod('wiring.redo',         'Redo last undone change',                   Type.Object({})),
    autoLayout:   bridgeMethod('wiring.autoLayout',   'Auto-arrange all nodes',                    Type.Object({})),
  },
})

const orchestrationPlugin = plugin('orchestration', {
  version: '0.1.0',
  description: 'Orchestration workflow management (available when orchestration view is active)',
  methods: {
    create:       bridgeMethod('orchestration.create',       'Create a new empty workflow',                       Type.Object({})),
    list:         bridgeMethod('orchestration.list',         'List all workflows',                               Type.Object({}), { screenshot: false }),
    select:       bridgeMethod('orchestration.select',       'Select a workflow by ID',                          Type.Object({ id: Type.String() })),
    delete:       bridgeMethod('orchestration.delete',       'Delete a workflow by ID',                          Type.Object({ id: Type.String() })),
    rename:       bridgeMethod('orchestration.rename',       'Rename the selected workflow',                     Type.Object({ name: Type.String() })),
    addStep:      bridgeMethod('orchestration.addStep',      'Add a step to the selected workflow',              Type.Object({ backend: Type.String(), method: Type.String() })),
    removeStep:   bridgeMethod('orchestration.removeStep',   'Remove a step from the selected workflow',         Type.Object({ stepId: Type.String() })),
    setStepParams: bridgeMethod('orchestration.setStepParams', 'Set parameters on a workflow step',
      Type.Object({ stepId: Type.String(), params: Type.Record(Type.String(), Type.Unknown()) })),
    wireSteps:    bridgeMethod('orchestration.wireSteps',    'Wire one step\'s result into another step\'s param',
      Type.Object({ fromStepId: Type.String(), fromPath: Type.String(), toStepId: Type.String(), toParam: Type.String() })),
    removeWire:   bridgeMethod('orchestration.removeWire',   'Remove a wire from a step',                       Type.Object({ stepId: Type.String(), wireIndex: Type.Number() })),
    run:          bridgeMethod('orchestration.run',          'Run a workflow by ID (or selected)',               Type.Object({ id: Type.Optional(Type.String()) })),
    stop:         bridgeMethod('orchestration.stop',         'Stop a running workflow',                          Type.Object({})),
    getState:     bridgeMethod('orchestration.getState',     'Get current run state of all workflows',          Type.Object({}), { screenshot: false }),
  },
})

const screenshotPlugin = plugin('screenshot', {
  version: '0.1.0',
  description: 'UI screenshot capture',
  methods: {
    take: method({
      description: 'Take a screenshot of the current UI state and return the file path',
      params: Type.Object({
        label: Type.Optional(Type.String({ description: 'Label appended to the filename', default: 'manual' })),
      }),
      async run({ label = 'manual' }) {
        if (!isHeadlessReady()) return { error: 'No headless browser running' }
        const path = await screenshot(label)
        return { path }
      },
    }),
  },
})

const replayPlugin = plugin('replay', {
  version: '0.1.0',
  description: 'Invocation history replay (available when replay panel is open)',
  methods: {
    list:   bridgeMethod('replay.list',   'List all recorded invocations',       Type.Object({}), { screenshot: false }),
    invoke: bridgeMethod('replay.invoke', 'Re-invoke a historical record by ID', Type.Object({ id: Type.String() })),
    clear:  bridgeMethod('replay.clear',  'Clear all invocation history',        Type.Object({})),
    remove: bridgeMethod('replay.remove', 'Remove a specific record by ID',      Type.Object({ id: Type.String() })),
  },
})

const appPlugin = plugin('app', {
  version: '0.2.0',
  description: 'App builder — scaffold real Vue 3 + TypeScript projects from backend methods (available when build view is active)',
  methods: {
    getState:         bridgeMethod('app.getState',         'Get the full project state as JSON',                           Type.Object({}), { screenshot: false }),
    setName:          bridgeMethod('app.setName',          'Set the project name',                                         Type.Object({ name: Type.String() })),
    setBackend:       bridgeMethod('app.setBackend',       'Set a backend URL by name',                                    Type.Object({ name: Type.String(), url: Type.String() })),
    reset:            bridgeMethod('app.reset',            'Reset the project to a blank state',                           Type.Object({})),
    generateCode:     bridgeMethod('app.generateCode',     'Generate all project files as a { files } map',                Type.Object({}), { screenshot: false }),
    addPage:          bridgeMethod('app.addPage',          'Add a new page',                                               Type.Object({})),
    deletePage:       bridgeMethod('app.deletePage',       'Delete a page by ID',                                          Type.Object({ pageId: Type.String() })),
    setActivePage:    bridgeMethod('app.setActivePage',    'Switch to a page by ID',                                       Type.Object({ pageId: Type.String() })),
    renamePage:       bridgeMethod('app.renamePage',       'Rename a page (title, name, route all optional)',              Type.Object({ pageId: Type.String(), title: Type.String(), name: Type.Optional(Type.String()), route: Type.Optional(Type.String()) })),
    addBlock:         bridgeMethod('app.addBlock',         'Add a block to a page. type: heading|text|list|button|form|stream|json', Type.Object({ pageId: Type.String(), type: Type.String() })),
    deleteBlock:      bridgeMethod('app.deleteBlock',      'Delete a block by ID',                                         Type.Object({ blockId: Type.String() })),
    moveBlockUp:      bridgeMethod('app.moveBlockUp',      'Move a block up',                                              Type.Object({ blockId: Type.String() })),
    moveBlockDown:    bridgeMethod('app.moveBlockDown',    'Move a block down',                                            Type.Object({ blockId: Type.String() })),
    updateBlockProp:  bridgeMethod('app.updateBlockProp',  'Update a prop on a block',                                     Type.Object({ blockId: Type.String(), key: Type.String(), value: Type.Unknown() })),
    setBlockBinding:  bridgeMethod('app.setBlockBinding',  'Bind a block to a backend method (or pass null to clear)',     Type.Object({ blockId: Type.String(), binding: Type.Optional(Type.Unknown()) })),
  },
})

const assertionPlugin = plugin('assertion', {
  version: '0.1.0',
  description: 'Assertion suite test management (available when invoker panel is visible)',
  methods: {
    list:       bridgeMethod('assertion.list',       'List test cases',
      Type.Object({ method: Type.Optional(Type.String()) }), { screenshot: false }),
    addTest:    bridgeMethod('assertion.addTest',    'Add a new test case',
      Type.Object({ name: Type.String(), method: Type.String(),
        params: Type.Optional(Type.Unknown()), assertions: Type.Optional(Type.Array(Type.Unknown())) })),
    removeTest: bridgeMethod('assertion.removeTest', 'Remove a test case by ID', Type.Object({ id: Type.String() })),
    runTest:    bridgeMethod('assertion.runTest',    'Run a single test case',
      Type.Object({ id: Type.String(), backend: Type.Optional(Type.String()) }), { screenshot: false }),
    runAll:     bridgeMethod('assertion.runAll',     'Run all tests',
      Type.Object({ method: Type.Optional(Type.String()), backend: Type.Optional(Type.String()) }), { screenshot: false }),
  },
})

export const plexusGammaPlugin = plugin('plexus-gamma', {
  version: '0.1.0',
  description: 'plexus-gamma UI control backend',
  children: [uiPlugin, backendsPlugin, invokePlugin, statePlugin, screenshotPlugin, wiringPlugin, orchestrationPlugin, replayPlugin, assertionPlugin, appPlugin],
})
