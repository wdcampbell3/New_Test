<script lang="ts">
  import { page } from "$app/stores"
  import { hideSidebar } from "$lib/stores/gameState"

  const experiments2D = [
    { name: "Space Invaders", path: "/space-invaders", icon: "👾" },
    { name: "Light Particles", path: "/light-cycles", icon: "💡" },
    { name: "Cosmic Pong", path: "/pong", icon: "🏓" },
    { name: "Tower Assault", path: "/tower-defense", icon: "🗼" },
    { name: "Mine Buster", path: "/minesweeper", icon: "💣" },
    { name: "Snake-adelic", path: "/worm-game", icon: "🐍" },
  ]

  const experiments3D = [
    { name: "World Builder", path: "/world-builder", icon: "🏗️" },
    { name: "Blocky Shooter", path: "/fps-game", icon: "🎯" },
    { name: "Starship Flyer", path: "/starship-flyer", icon: "🚀" },
  ]
</script>

<div class="drawer {$hideSidebar ? '' : 'lg:drawer-open'}">
  <input id="experiments-drawer" type="checkbox" class="drawer-toggle" />
  <div class="drawer-content flex flex-col">
    <!-- Page content here -->
    <div class="navbar bg-base-200 {$hideSidebar ? 'hidden' : 'lg:hidden'}">
      <div class="flex-none">
        <label for="experiments-drawer" class="btn btn-square btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="inline-block h-5 w-5 stroke-current"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            ></path>
          </svg>
        </label>
      </div>
      <div class="flex-1">
        <span class="text-xl font-bold">Experiments</span>
      </div>
    </div>
    <div class="{$hideSidebar ? '' : 'p-4'}">
      <slot />
    </div>
  </div>
  <div class="drawer-side">
    <label
      for="experiments-drawer"
      aria-label="close sidebar"
      class="drawer-overlay"
    ></label>
    <aside class="min-h-screen w-64 bg-base-200 text-base-content border-r-2" style="border-color: rgba(102, 4, 96, 0.33);">
      <div class="p-4">
        <h2 class="text-2xl font-bold mb-6">🧪 Experiments</h2>

        <!-- Back to Home button -->
        <a
          href="/"
          class="btn btn-block mb-4 text-white border-0 hover:opacity-90"
          style="background-color: #660460;"
        >
          ← Back to Home
        </a>

        <!-- 3D Games Section -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-base-content/60 mb-2 px-4">
            3D Games
          </h3>
          <ul class="menu gap-2">
            {#each experiments3D as experiment}
              <li>
                <a
                  href={experiment.path}
                  class:active={$page.url.pathname === experiment.path}
                  class="flex items-center gap-3"
                >
                  <span class="text-2xl">{experiment.icon}</span>
                  <span>{experiment.name}</span>
                </a>
              </li>
            {/each}
          </ul>
        </div>

        <!-- 2D Games Section -->
        <div>
          <h3 class="text-sm font-semibold text-base-content/60 mb-2 px-4">
            2D Games
          </h3>
          <ul class="menu gap-2">
            {#each experiments2D as experiment}
              <li>
                <a
                  href={experiment.path}
                  class:active={$page.url.pathname === experiment.path}
                  class="flex items-center gap-3"
                >
                  <span class="text-2xl">{experiment.icon}</span>
                  <span>{experiment.name}</span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </aside>
  </div>
</div>
