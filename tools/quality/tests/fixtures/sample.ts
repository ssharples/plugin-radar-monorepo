function declared(value: string): string;
function declared(value: number): string;
function declared(value: string | number): string { return String(value); }

class Box {
  get value() { return this._value; }
  set value(next: number) { this._value = next; }
  implemented() { return this.value; }
}

