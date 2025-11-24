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
  <div class="fixed inset-0 z-50 flex flex-col" style="background-color: #fffdef;">
    <!-- Purple Header -->
    <div class="w-full py-8 px-4 text-center" style="background-color: #660460;">
      <div class="text-5xl mb-4">🎮</div>
      <h1 class="text-3xl font-bold text-white mb-2">
        Dougie's Game Hub
      </h1>
      <p class="text-lg text-white/90 italic">
        Vibe Coded—100% AI Chat-Prompted—Game Experiments!
      </p>
    </div>

    <!-- Content Area -->
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="card bg-white shadow-xl max-w-md w-full">
        <div class="card-body text-center">
          <div class="text-4xl mb-4">💻</div>
          <h2 class="text-2xl font-bold mb-2" style="color: #660460;">
            Only Available on Desktop
          </h2>
          <p class="text-gray-600">
            These games are designed for keyboard and mouse. Please visit on a desktop computer for the full experience!
          </p>
          <div class="divider"></div>
          <p class="text-sm text-gray-400">
            Minimum screen width: 1024px
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}
