<script lang="ts">
  const games3D = [
    {
      name: "🏗️ World Builder",
      path: "/world-builder",
      description: "Design 3D worlds with hundreds of models, then explore them in first-person mode",
      image: "/game-thumbs/world-builder.jpg",
    },
    {
      name: "🎯 Blocky Shooter",
      path: "/fps-game",
      description: "First-person shooter with multiple weapons, enemy types, and power-ups across custom maps",
      image: "/game-thumbs/fps-game.jpg",
    },
    {
      name: "🚀 Starship Flyer",
      path: "/starship-flyer",
      description: "Physics-based 3D dogfighting with barrel rolls, weapon pickups, and boss battles",
      image: "/game-thumbs/starship-flyer.jpg",
    },
  ]

  const games2D = [
    {
      name: "👾 Space Invaders",
      path: "/space-invaders",
      description: "Classic arcade defense with shield bunkers, boss waves, and 6 different power-ups",
      image: "/game-thumbs/space-invaders.jpg",
    },
    {
      name: "💡 Light Particles",
      path: "/light-cycles",
      description: "TRON-style trail combat—dodge walls while boxing in your AI opponent",
      image: "/game-thumbs/light-particles.jpg",
    },
    {
      name: "🏓 Cosmic Pong",
      path: "/pong",
      description: "Spaceship paddle action with freeze, lightning, and shrink power-ups",
      image: "/game-thumbs/cosmic-pong.jpg",
    },
    {
      name: "🗼 Tower Assault",
      path: "/tower-defense",
      description: "Strategic tower placement with 6 tower types across 5 escalating waves",
      image: "/game-thumbs/tower-assault.jpg",
    },
    {
      name: "💣 Mine Buster",
      path: "/minesweeper",
      description: "Logic-based minesweeper with X-Ray vision, lasers, and bombs—plus traps!",
      image: "/game-thumbs/mine-buster.jpg",
    },
    {
      name: "🐍 Snake-adelic",
      path: "/worm-game",
      description: "Trippy snake game with bizarre power-ups on pulsing psychedelic backgrounds",
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
      <h2 class="text-4xl font-bold mb-2 text-center" style="color: #660460;">
        3D Games
      </h2>
      <p class="text-lg text-gray-600 text-center mb-8">Build a custom world... And play games in it!</p>
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
      <h2 class="text-4xl font-bold mb-2 text-center" style="color: #660460;">
        2D Games
      </h2>
      <p class="text-lg text-gray-600 text-center mb-8">Power Packed Upgrades to Old Classics!</p>
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
