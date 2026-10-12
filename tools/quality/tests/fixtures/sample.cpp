#include <vector>
int overloaded(int value) { return value; }
int overloaded(double value) { return static_cast<int>(value); }
int run(const std::vector<int>& values) {
  auto callback = [](int value) { return value > 0 ? value : 0; };
  if (!values.empty() && callback(values.front())) return callback(values.front());
  return 0;
}

int decisions(int value, const std::vector<int>& values) {
  if (value && values.size() || value) return 1;
  for (int item : values) { if (item) break; }
  while (value) --value;
  do { ++value; } while (value < 2);
  switch (value) { case 1: return 1; case 2: return 2; default: return 0; }
  return value > 0 ? value : 0;
}

