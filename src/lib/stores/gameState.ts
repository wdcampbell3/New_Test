import { writable } from 'svelte/store'

// Store to control sidebar visibility from game pages
export const hideSidebar = writable(false)
