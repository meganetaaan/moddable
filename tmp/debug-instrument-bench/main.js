function runTrial(iterations) {
  let x = 0;
  const t0 = Date.now();
  for (let i = 0; i < iterations; i++)
    x = ((x * 1664525) + 1013904223) | 0;
  return { elapsed: Date.now() - t0, x };
}

export { runTrial };
