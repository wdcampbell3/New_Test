<script lang="ts">
  const games3D = [
    {
      name: "🏗️ World Builder",
      path: "/world-builder",
      description: "Create and explore custom 3D worlds with your own designs",
      image: "/game-thumbs/world-builder.jpg",
    },
    {
      name: "🎯 Blocky Shooter",
      path: "/fps-game",
      description: "First-person shooter with destructible environments",
      image: "/game-thumbs/fps-game.jpg",
    },
    {
      name: "🚀 Starship Flyer",
      path: "/starship-flyer",
      description: "Arcade space dogfighting with waves of alien enemies",
      image: "/game-thumbs/starship-flyer.jpg",
    },
  ]

  const games2D = [
    {
      name: "👾 Space Invaders",
      path: "/space-invaders",
      description: "Defend Earth from alien invasion",
      image: "/game-thumbs/space-invaders.jpg",
    },
    {
      name: "💡 Light Particles",
      path: "/light-cycles",
      description: "TRON-style light particle battles with power-ups",
      image: "/game-thumbs/light-particles.jpg",
    },
    {
      name: "🏓 Cosmic Pong",
      path: "/pong",
      description: "Classic arcade game - beat the AI!",
      image: "/game-thumbs/cosmic-pong.jpg",
    },
    {
      name: "🗼 Tower Assault",
      path: "/tower-defense",
      description: "Build towers and defend your base",
      image: "/game-thumbs/tower-assault.jpg",
    },
    {
      name: "💣 Mine Buster",
      path: "/minesweeper",
      description: "Classic puzzle game with power-ups - find all the mines",
      image: "/game-thumbs/mine-buster.jpg",
    },
    {
      name: "🐍 Snake-adelic",
      path: "/worm-game",
      description: "Psychedelic snake game with power-ups",
      image: "/game-thumbs/snake-adelic.jpg",
    },
  ]
</script>

<svelte:head>
  <title>Dougie's Game Hub | Vibe Coded—100% AI Chat-Prompted—Game Experiments!</title>
</svelte:head>

<div class="min-h-screen bg-base-200">
  <!-- Header Banner -->
  <div class="w-full py-8 mb-8" style="background-color: #660460;">
    <div class="container mx-auto px-4 text-center">
      <h1 class="text-5xl font-bold mb-2 text-white">
        Dougie's Game Hub
      </h1>
      <p class="text-xl text-white italic">
        Vibe Coded—100% AI Chat-Prompted—Game Experiments!
      </p>
    </div>
  </div>

  <div class="container mx-auto px-4 pb-12">

    <!-- 3D Games Section -->
    <div class="mb-16">
      <h2 class="text-4xl font-bold mb-8 text-center" style="color: #660460;">
        3D Games
      </h2>
      <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto"
      >
        {#each games3D as game}
          <a
            href={game.path}
            class="card bg-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
          >
            <figure class="h-48 overflow-hidden">
              <img
                src={game.image}
                alt={game.name}
                class="w-full h-full object-cover"
              />
            </figure>
            <div class="card-body">
              <h2 class="card-title" style="color: #660460;">
                {game.name}
              </h2>
              <p class="text-gray-600">{game.description}</p>
            </div>
          </a>
        {/each}
      </div>
    </div>

    <!-- 2D Games Section -->
    <div>
      <h2 class="text-4xl font-bold mb-8 text-center" style="color: #660460;">
        2D Games
      </h2>
      <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto"
      >
        {#each games2D as game}
          <a
            href={game.path}
            class="card bg-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
          >
            <figure class="h-48 overflow-hidden">
              <img
                src={game.image}
                alt={game.name}
                class="w-full h-full object-cover"
              />
            </figure>
            <div class="card-body">
              <h2 class="card-title" style="color: #660460;">
                {game.name}
              </h2>
              <p class="text-gray-600">{game.description}</p>
            </div>
          </a>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background-color: #fffdef;
    overflow: auto;
  }
</style>
