import { plugin, method } from '@plexus/rpc'
import { Type } from '@sinclair/typebox'
import { forwardToBridge } from './bridge-connection'

// Bridge-forwarding method factory — passes all calls through to the Vue app.
// forwardToBridge yields plain content values; the @plexus/rpc server wraps them
// in subscription data items before sending to external callers.
function bridgeMethod(
  fullMethodName: string,
  description: string,
  paramsSchema: ReturnType<typeof Type.Object>,
  streaming = false,
) {
  return method({
    description,
    streaming,
    params: paramsSchema,
    async *run(params) {
      yield* forwardToBridge(fullMethodName, params)
    },
  })
}

const uiPlugin = plugin('ui', {
  version: '0.1.0',
  description: 'UI navigation and theme',
  methods: {
    navigate:  bridgeMethod('ui.navigate',  'Switch to a view tab',   Type.Object({ view:  Type.String() })),
    getView:   bridgeMethod('ui.getView',   'Get current view name',  Type.Object({})),
    setTheme:  bridgeMethod('ui.setTheme',  'Set UI theme',           Type.Object({ theme: Type.String() })),
    getTheme:  bridgeMethod('ui.getTheme',  'Get current theme',      Type.Object({})),
  },
})

const backendsPlugin = plugin('backends', {
  version: '0.1.0',
  description: 'Backend connection management',
  methods: {
    list:      bridgeMethod('backends.list',      'List all connected backends',           Type.Object({})),
    add:       bridgeMethod('backends.add',       'Add a new backend connection',          Type.Object({ name: Type.String(), url: Type.String() })),
    remove:    bridgeMethod('backends.remove',    'Remove a backend connection',           Type.Object({ name: Type.String() })),
    setActive: bridgeMethod('backends.setActive', 'Set the active backend',               Type.Object({ name: Type.String() })),
    health:    bridgeMethod('backends.health',    'Get health status of all backends',     Type.Object({})),
    methods:   bridgeMethod('backends.methods',   'List all known methods across backends', Type.Object({})),
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
      true,
    ),
  },
})

const statePlugin = plugin('state', {
  version: '0.1.0',
  description: 'Live UI state subscription',
  methods: {
    watch: bridgeMethod('state.watch', 'Stream live UI state change events', Type.Object({}), true),
  },
})

export const plexusGammaPlugin = plugin('plexus-gamma', {
  version: '0.1.0',
  description: 'plexus-gamma UI control backend',
  children: [uiPlugin, backendsPlugin, invokePlugin, statePlugin],
})
