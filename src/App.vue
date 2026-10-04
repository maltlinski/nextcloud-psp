<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import NcContent from '@nextcloud/vue/components/NcContent'
import PlanEditor from './views/PlanEditor.vue'
import StartPage from './views/StartPage.vue'

const fileId = Number(new URLSearchParams(window.location.search).get('fileId')) || null
</script>

<template>
	<NcContent app-name="psp">
		<PlanEditor v-if="fileId" :file-id="fileId" />
		<StartPage v-else />
	</NcContent>
</template>
