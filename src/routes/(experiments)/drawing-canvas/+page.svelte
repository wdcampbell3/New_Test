<script lang="ts">
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let isDrawing = $state(false);
	let brushColor = $state('#000000');
	let brushSize = $state(5);
	let tool = $state<'brush' | 'eraser'>('brush');
	let cursorX = $state(0);
	let cursorY = $state(0);
	let showCursor = $state(false);

	const colors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff'];

	function startDrawing(e: MouseEvent | TouchEvent) {
		isDrawing = true;
		draw(e);
	}

	function stopDrawing() {
		isDrawing = false;
		ctx.beginPath();
	}

	function updateCursorPosition(e: MouseEvent | TouchEvent) {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;

		let clientX: number, clientY: number;

		if (e instanceof MouseEvent) {
			clientX = e.clientX;
			clientY = e.clientY;
		} else {
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		}

		// Position relative to canvas element (for cursor display)
		cursorX = clientX - rect.left;
		cursorY = clientY - rect.top;

		// Position scaled to canvas coordinates (for drawing)
		const x = (clientX - rect.left) * scaleX;
		const y = (clientY - rect.top) * scaleY;

		return { x, y };
	}

	function draw(e: MouseEvent | TouchEvent) {
		const { x, y } = updateCursorPosition(e);

		if (!isDrawing) return;

		e.preventDefault();

		ctx.lineWidth = brushSize;
		ctx.lineCap = 'round';
		ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : brushColor;

		ctx.lineTo(x, y);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(x, y);
	}

	function clearCanvas() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		// Fill with white background
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function downloadImage() {
		const link = document.createElement('a');
		link.download = 'drawing.png';
		link.href = canvas.toDataURL();
		link.click();
	}

	onMount(() => {
		const context = canvas.getContext('2d');
		if (!context) return;
		ctx = context;

		// Set initial white background
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	});
</script>

<svelte:head>
	<title>Drawing Canvas</title>
</svelte:head>

<div class="container mx-auto max-w-6xl">
	<h1 class="mb-6 text-3xl font-bold">🎨 Drawing Canvas</h1>

	<div class="flex flex-col lg:flex-row gap-6">
		<!-- Tools Panel -->
		<div class="card bg-base-100 shadow-xl lg:w-64">
			<div class="card-body">
				<h2 class="card-title mb-4">Tools</h2>

				<!-- Tool Selection -->
				<div class="form-control mb-4">
					<label class="label">
						<span class="label-text font-semibold">Tool</span>
					</label>
					<div class="btn-group w-full">
						<button
							class="btn btn-sm flex-1"
							class:btn-active={tool === 'brush'}
							onclick={() => (tool = 'brush')}
						>
							🖌️ Brush
						</button>
						<button
							class="btn btn-sm flex-1"
							class:btn-active={tool === 'eraser'}
							onclick={() => (tool = 'eraser')}
						>
							🧹 Eraser
						</button>
					</div>
				</div>

				<!-- Color Picker -->
				<div class="form-control mb-4">
					<label class="label">
						<span class="label-text font-semibold">Color</span>
					</label>
					<div class="grid grid-cols-5 gap-2 mb-2">
						{#each colors as color}
							<button
								class="btn btn-square btn-sm"
								class:ring-2={brushColor === color}
								class:ring-primary={brushColor === color}
								style="background-color: {color}; border-color: {color === '#ffffff' ? '#e5e7eb' : color}"
								onclick={() => (brushColor = color)}
							></button>
						{/each}
					</div>
					<input
						type="color"
						class="w-full h-10 rounded-btn cursor-pointer"
						bind:value={brushColor}
					/>
				</div>

				<!-- Brush Size -->
				<div class="form-control mb-4">
					<label class="label">
						<span class="label-text font-semibold">Brush Size: {brushSize}px</span>
					</label>
					<input
						type="range"
						min="1"
						max="50"
						bind:value={brushSize}
						class="range range-primary"
					/>
				</div>

				<!-- Actions -->
				<div class="divider"></div>
				<button onclick={clearCanvas} class="btn btn-warning btn-block mb-2">
					🗑️ Clear Canvas
				</button>
				<button onclick={downloadImage} class="btn btn-primary btn-block">
					💾 Download Image
				</button>
			</div>
		</div>

		<!-- Canvas -->
		<div class="flex-1">
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body p-4">
					<div class="relative inline-block">
						<canvas
							bind:this={canvas}
							width="800"
							height="600"
							class="border-2 border-base-300 rounded-lg cursor-none touch-none"
							style="max-width: 100%; height: auto; display: block;"
							onmousedown={startDrawing}
							onmouseup={stopDrawing}
							onmousemove={draw}
							onmouseleave={() => {
								stopDrawing();
								showCursor = false;
							}}
							onmouseenter={() => (showCursor = true)}
							ontouchstart={startDrawing}
							ontouchend={stopDrawing}
							ontouchmove={draw}
						></canvas>

						<!-- Custom Cursor -->
						{#if showCursor && canvas}
							{@const rect = canvas.getBoundingClientRect()}
							{@const scale = rect.width / canvas.width}
							{@const displaySize = brushSize * scale}
							<div
								class="custom-cursor pointer-events-none absolute rounded-full border-2"
								style="
									left: {cursorX}px;
									top: {cursorY}px;
									width: {displaySize}px;
									height: {displaySize}px;
									border-color: {tool === 'eraser' ? '#666' : brushColor};
									background: {tool === 'eraser' ? 'rgba(255,255,255,0.5)' : brushColor + '33'};
									transform: translate(-50%, -50%);
								"
							></div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	canvas {
		background: white;
	}
</style>
