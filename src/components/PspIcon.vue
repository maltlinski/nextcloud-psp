<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 64 })

const path = 'M8.5 2h7v5h-7zM11.25 7h1.5v2.5h-1.5zM3.25 9.5h17.5V11H3.25zM3.25 11h1.5v3h-1.5zM11.25 11h1.5v3h-1.5zM19.25 11h1.5v3h-1.5zM.5 14h7v5h-7zM8.5 14h7v5h-7zM16.5 14h7v5h-7z'
</script>

<template>
	<svg :width="size"
		:height="size"
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true">
		<path :d="path" />
	</svg>
</template>
