/**
 * Budget Calculation Logic
 * Handles all budget computations including staff costs with on-costs,
 * fEC calculations, and funder contribution splits.
 */

const DEFAULT_ON_COST_RATE = 0.25; // 25% employer NI + pension

/**
 * Calculate complete budget breakdown
 * @param {Object} budgetData - All budget line items
 * @returns {Object} Calculated totals and breakdowns
 */
function calculateBudget(budgetData) {
  const {
    staff = [],
    travel = [],
    equipment = [],
    consumables = [],
    other = [],
    subcontracting = [],
    costModel = 'fEC',     // 'fEC', 'full', 'custom'
    fecRate = 80,           // % funder pays of fEC
    overheadRate = 25,      // % overhead on direct costs
    customRate = 100        // for custom cost model
  } = budgetData;

  // ── Staff Costs ──
  const staffCalc = staff.map(item => {
    const baseSalary = parseFloat(item.salary) || 0;
    const fte = (parseFloat(item.fte) || 100) / 100;
    const months = parseFloat(item.months) || 0;
    const onCostRate = parseFloat(item.onCostRate) || DEFAULT_ON_COST_RATE;

    const annualCost = baseSalary * fte;
    const monthlyCost = annualCost / 12;
    const totalBase = monthlyCost * months;
    const onCosts = totalBase * onCostRate;
    const totalWithOnCosts = totalBase + onCosts;

    return {
      ...item,
      fte: fte * 100,
      annualCost,
      monthlyCost,
      totalBase: round(totalBase),
      onCosts: round(onCosts),
      total: round(totalWithOnCosts)
    };
  });

  // ── Travel & Subsistence ──
  const travelCalc = travel.map(item => {
    const costPerTrip = parseFloat(item.costPerTrip) || 0;
    const numTrips = parseFloat(item.numTrips) || 1;
    return {
      ...item,
      total: round(costPerTrip * numTrips)
    };
  });

  // ── Equipment ──
  const equipmentCalc = equipment.map(item => ({
    ...item,
    total: round(parseFloat(item.cost) || 0)
  }));

  // ── Consumables ──
  const consumablesCalc = consumables.map(item => ({
    ...item,
    total: round(parseFloat(item.cost) || 0)
  }));

  // ── Other Costs ──
  const otherCalc = other.map(item => ({
    ...item,
    total: round(parseFloat(item.cost) || 0)
  }));

  // ── Subcontracting ──
  const subCalc = subcontracting.map(item => ({
    ...item,
    total: round(parseFloat(item.cost) || 0)
  }));

  // ── Category Totals ──
  const staffTotal = sum(staffCalc.map(i => i.total));
  const travelTotal = sum(travelCalc.map(i => i.total));
  const equipmentTotal = sum(equipmentCalc.map(i => i.total));
  const consumablesTotal = sum(consumablesCalc.map(i => i.total));
  const otherTotal = sum(otherCalc.map(i => i.total));
  const subTotal = sum(subCalc.map(i => i.total));

  // Direct costs (everything except estates/indirect)
  const directCosts = staffTotal + travelTotal + equipmentTotal + consumablesTotal + otherTotal + subTotal;

  // Indirect costs (overhead)
  const indirectCosts = round(directCosts * (overheadRate / 100));

  // Full Economic Cost
  const fullEconomicCost = round(directCosts + indirectCosts);

  // Funder contribution based on cost model
  let funderContribution, institutionContribution, rate;
  switch (costModel) {
    case 'fEC':
      rate = fecRate / 100;
      funderContribution = round(fullEconomicCost * rate);
      institutionContribution = round(fullEconomicCost - funderContribution);
      break;
    case 'full':
      funderContribution = fullEconomicCost;
      institutionContribution = 0;
      rate = 1;
      break;
    case 'custom':
      rate = customRate / 100;
      funderContribution = round(fullEconomicCost * rate);
      institutionContribution = round(fullEconomicCost - funderContribution);
      break;
    default:
      rate = fecRate / 100;
      funderContribution = round(fullEconomicCost * rate);
      institutionContribution = round(fullEconomicCost - funderContribution);
  }

  return {
    categories: {
      staff: { items: staffCalc, total: staffTotal },
      travel: { items: travelCalc, total: travelTotal },
      equipment: { items: equipmentCalc, total: equipmentTotal },
      consumables: { items: consumablesCalc, total: consumablesTotal },
      other: { items: otherCalc, total: otherTotal },
      subcontracting: { items: subCalc, total: subTotal }
    },
    summary: {
      directCosts,
      indirectCosts,
      overheadRate,
      fullEconomicCost,
      costModel,
      funderRate: round(rate * 100),
      funderContribution,
      institutionContribution
    }
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function sum(arr) {
  return round(arr.reduce((a, b) => a + b, 0));
}

module.exports = { calculateBudget };
