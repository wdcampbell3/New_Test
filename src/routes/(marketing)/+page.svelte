<script lang="ts">
  const experiments = [
    {
      name: "Loan Calculator",
      path: "/loan-calculator",
      description: "Calculate loan payments and interest",
      image:
        "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&h=300&fit=crop",
    },
    {
      name: "Worm Game",
      path: "/worm-game",
      description: "Classic snake game with a twist",
      image:
        "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400&h=300&fit=crop",
    },
    {
      name: "Drawing Canvas",
      path: "/drawing-canvas",
      description: "Create digital art with brushes and colors",
      image:
        "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=300&fit=crop",
    },
    {
      name: "Pong",
      path: "/pong",
      description: "Classic arcade game - beat the AI!",
      image:
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop",
    },
    {
      name: "Space Invaders",
      path: "/space-invaders",
      description: "Defend Earth from alien invasion",
      image:
        "https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&h=300&fit=crop",
    },
  ]
</script>

<div class="min-h-screen bg-gray-100">
  <div class="container mx-auto px-4 py-12">
    <!-- Header -->
    <div class="text-center mb-16">
      <h1 class="text-6xl font-bold mb-4" style="color: #660460;">
        Dougie's Hub
      </h1>
      <p class="text-2xl text-gray-600 italic">Experiments in Vibe Coding</p>
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
