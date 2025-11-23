<script lang="ts">
  const games2D = [
    {
      name: "👾 Space Invaders",
      path: "/space-invaders",
      description: "Defend Earth from alien invasion",
      image:
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop",
    },
    {
      name: "💡 Light Particles",
      path: "/light-cycles",
      description: "TRON-style light particle battles with power-ups",
      image:
        "https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=400&h=300&fit=crop",
    },
    {
      name: "🏓 Cosmic Pong",
      path: "/pong",
      description: "Classic arcade game - beat the AI!",
      image:
        "https://images.unsplash.com/photo-1534158914592-062992fbe900?w=400&h=300&fit=crop",
    },
    {
      name: "🗼 Tower Assault",
      path: "/tower-defense",
      description: "Build towers and defend your base",
      image:
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=300&fit=crop",
    },
    {
      name: "💣 Mine Buster",
      path: "/minesweeper",
      description: "Classic puzzle game with power-ups - find all the mines",
      image:
        "https://images.unsplash.com/photo-1635514569146-9a9607ecf303?w=400&h=300&fit=crop",
    },
    {
      name: "🐍 Snake-adelic",
      path: "/worm-game",
      description: "Psychedelic snake game with power-ups",
      image:
        "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=400&h=300&fit=crop",
    },
  ]

  const games3D = [
    {
      name: "🏗️ World Builder",
      path: "/world-builder",
      description: "Create and explore custom 3D worlds with your own designs",
      image:
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=300&fit=crop",
    },
    {
      name: "🎯 Blocky Shooter",
      path: "/fps-game",
      description: "First-person shooter with destructible environments",
      image:
        "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400&h=300&fit=crop",
    },
    {
      name: "🚀 Starship Flyer",
      path: "/starship-flyer",
      description: "Arcade space dogfighting with waves of alien enemies",
      image:
        "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=400&h=300&fit=crop",
    },
  ]
</script>

<svelte:head>
  <title>Dougie's Game Hub | Vibe Coding Updates to some Classics!</title>
</svelte:head>

<div class="min-h-screen bg-gray-100">
  <div class="container mx-auto px-4 py-12">
    <!-- Header -->
    <div class="text-center mb-16">
      <h1 class="text-6xl font-bold mb-4" style="color: #660460;">
        Dougie's Game Hub
      </h1>
      <p class="text-2xl text-gray-600 italic">
        Vibe Coding Updates to some Classics!
      </p>
    </div>

    <!-- 2D Games Section -->
    <div class="mb-16">
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
              <div class="card-actions justify-end mt-4">
                <button
                  class="btn text-white border-0 hover:opacity-90"
                  style="background-color: #660460;"
                >
                  Try it →
                </button>
              </div>
            </div>
          </a>
        {/each}
      </div>
    </div>

    <!-- 3D Games Section -->
    <div>
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
              <div class="card-actions justify-end mt-4">
                <button
                  class="btn text-white border-0 hover:opacity-90"
                  style="background-color: #660460;"
                >
                  Try it →
                </button>
              </div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background-color: #f3f4f6;
  }
</style>
