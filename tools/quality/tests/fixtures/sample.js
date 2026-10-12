function run(items) {
  if (items && items.length) return items.map((item) => item ?? 0);
  return () => 0;
}

function decisions(value, values) {
  if (value && values.length || value) return 1;
  else if (value) return 2;
  else return 3;
  for (const item of values) { if (item) break; }
  while (value) value--;
  do { value++; } while (value < 2);
  switch (value) { case 1: return 1; case 2: return 2; default: return 0; }
}

const callback = function (value) { return value; };
const generator = function* () { yield 1; };
const expression = (a, b) => a && b ? a : b;
