<script lang="ts">
  let loanAmount = $state(10000)
  let interestRate = $state(5)
  let loanTermYears = $state(5)

  let monthlyPayment = $derived.by(() => {
    const principal = loanAmount
    const monthlyRate = interestRate / 100 / 12
    const numberOfPayments = loanTermYears * 12

    if (monthlyRate === 0) {
      return principal / numberOfPayments
    }

    const payment =
      (principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
      (Math.pow(1 + monthlyRate, numberOfPayments) - 1)

    return payment
  })

  let totalPayment = $derived(monthlyPayment * loanTermYears * 12)
  let totalInterest = $derived(totalPayment - loanAmount)
</script>

<svelte:head>
  <title>Loan Calculator</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-6">
  <h1 class="mb-8 text-center text-4xl font-bold" style="color: #660460;">Loan Calculator</h1>

  <div class="grid gap-8 lg:grid-cols-2">
    <!-- Input Section -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4" style="color: #660460;">Loan Details</h2>

        <div class="form-control">
          <label class="label" for="loanAmount">
            <span class="label-text">Loan Amount</span>
            <span class="label-text-alt">${loanAmount.toLocaleString()}</span>
          </label>
          <input
            type="range"
            id="loanAmount"
            min="1000"
            max="1000000"
            step="1000"
            bind:value={loanAmount}
            class="range range-primary"
          />
          <input
            type="number"
            bind:value={loanAmount}
            class="input input-bordered mt-2"
            min="1000"
            max="1000000"
            step="1000"
          />
        </div>

        <div class="form-control mt-4">
          <label class="label" for="interestRate">
            <span class="label-text">Annual Interest Rate (%)</span>
            <span class="label-text-alt">{interestRate.toFixed(2)}%</span>
          </label>
          <input
            type="range"
            id="interestRate"
            min="0"
            max="30"
            step="0.1"
            bind:value={interestRate}
            class="range range-primary"
          />
          <input
            type="number"
            bind:value={interestRate}
            class="input input-bordered mt-2"
            min="0"
            max="30"
            step="0.1"
          />
        </div>

        <div class="form-control mt-4">
          <label class="label" for="loanTerm">
            <span class="label-text">Loan Term (Years)</span>
            <span class="label-text-alt">{loanTermYears} years</span>
          </label>
          <input
            type="range"
            id="loanTerm"
            min="1"
            max="30"
            step="1"
            bind:value={loanTermYears}
            class="range range-primary"
          />
          <input
            type="number"
            bind:value={loanTermYears}
            class="input input-bordered mt-2"
            min="1"
            max="30"
            step="1"
          />
        </div>
      </div>
    </div>

    <!-- Results Section -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4" style="color: #660460;">Payment Summary</h2>

        <div class="stat">
          <div class="stat-title">Monthly Payment</div>
          <div class="stat-value text-primary">
            ${(monthlyPayment || 0).toFixed(2)}
          </div>
          <div class="stat-desc">Principal + Interest</div>
        </div>

        <div class="divider"></div>

        <div class="space-y-4">
          <div class="flex justify-between">
            <span class="font-semibold">Total Payment:</span>
            <span>${(totalPayment || 0).toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-semibold">Total Interest:</span>
            <span class="text-warning">${(totalInterest || 0).toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-semibold">Principal Amount:</span>
            <span>${(loanAmount || 0).toFixed(2)}</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="stats stats-vertical shadow">
          <div class="stat">
            <div class="stat-title">Number of Payments</div>
            <div class="stat-value text-sm">{loanTermYears * 12} months</div>
          </div>
          <div class="stat">
            <div class="stat-title">Interest to Principal Ratio</div>
            <div class="stat-value text-sm">
              {((totalInterest / loanAmount) * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
