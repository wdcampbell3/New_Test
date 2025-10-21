<script lang="ts">
  const experiments = [
    {
      name: "🐍 Snake-adelic",
      path: "/worm-game",
      description: "Psychedelic snake game with power-ups",
      image:
        "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=400&h=300&fit=crop",
    },
    {
      name: "🏓 Cosmic Pong",
      path: "/pong",
      description: "Classic arcade game - beat the AI!",
      image:
        "https://images.unsplash.com/photo-1534158914592-062992fbe900?w=400&h=300&fit=crop",
    },
    {
      name: "💡 Light Particles",
      path: "/light-cycles",
      description: "TRON-style light particle battles with power-ups",
      image:
        "https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=400&h=300&fit=crop",
    },
    {
      name: "👾 Space Invaders",
      path: "/space-invaders",
      description: "Defend Earth from alien invasion",
      image:
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop",
    },
    {
      name: "💣 Mine Buster",
      path: "/minesweeper",
      description: "Classic puzzle game with power-ups - find all the mines",
      image:
        "https://images.unsplash.com/photo-1635514569146-9a9607ecf303?w=400&h=300&fit=crop",
    },
    {
      name: "🗼 Tower Assault",
      path: "/tower-defense",
      description: "Build towers and defend your base",
      image:
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=300&fit=crop",
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
      <p class="text-2xl text-gray-600 italic">Vibe Coding Updates to some Classics!</p>
    </div>

    <!-- Experiment Cards -->
    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto"
    >
      {#each experiments as experiment}
        <a
          href={experiment.path}
          class="card bg-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
        >
          <figure class="h-48 overflow-hidden">
            <img
              src={experiment.image}
              alt={experiment.name}
              class="w-full h-full object-cover"
            />
          </figure>
          <div class="card-body">
            <h2 class="card-title" style="color: #660460;">
              {experiment.name}
            </h2>
            <p class="text-gray-600">{experiment.description}</p>
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

<style>
  :global(body) {
    background-color: #f3f4f6;
  }
</style>
