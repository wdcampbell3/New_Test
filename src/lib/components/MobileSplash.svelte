<script lang="ts">
  import { onMount } from 'svelte'

  let isMobile = $state(false)

  onMount(() => {
    // Check if device is mobile/tablet
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase()
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isSmallScreen = window.innerWidth < 1024 // Less than desktop breakpoint

      isMobile = isMobileDevice || (isTouchDevice && isSmallScreen)
    }

    checkMobile()

    // Re-check on resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  })
</script>

{#if isMobile}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary to-secondary p-8">
    <div class="text-center space-y-8 max-w-md">
      <div class="text-6xl mb-4">🎮</div>

      <h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
        Dougie's Game Hub
      </h1>

      <p class="text-xl md:text-2xl text-white/90 font-medium">
        Vibe Coding Updates to some Classics!
      </p>

      <div class="divider"></div>

      <div class="bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 border-white/20">
        <div class="text-3xl mb-3">💻</div>
        <p class="text-lg md:text-xl text-white font-semibold">
          ** Only Available on Desktop **
        </p>
        <p class="text-sm text-white/70 mt-3">
          These games are designed for keyboard and mouse. Please visit on a desktop computer for the full experience!
        </p>
      </div>

      <div class="text-sm text-white/60 mt-8">
        Minimum screen width: 1024px
      </div>
    </div>
  </div>
{/if}
