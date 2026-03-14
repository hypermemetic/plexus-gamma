<template><slot /></template>

<script setup lang="ts">
import { provide } from 'vue'
import type { PlexusRpcClient } from '../lib/plexus/transport'

const props = defineProps<{ rpc: PlexusRpcClient; backendName: string }>()
provide('rpc', props.rpc)
provide('backendName', props.backendName)
</script>
