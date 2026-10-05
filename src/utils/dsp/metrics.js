/** Correlación de Pearson. Devuelve 0 si alguna señal es constante. */
export function pearson(x, y) {
  const n = Math.min(x.length, y.length)
  if (n === 0) return 0
  let mx = 0, my = 0
  for (let i = 0; i < n; i++) {
    mx += x[i]
    my += y[i]
  }
  mx /= n
  my /= n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const den = Math.sqrt(sxx * syy)
  return den > 0 ? sxy / den : 0
}

/** Raíz del error cuadrático medio. */
export function rmse(x, y) {
  const n = Math.min(x.length, y.length)
  if (n === 0) return 0
  let s = 0
  for (let i = 0; i < n; i++) s += (x[i] - y[i]) ** 2
  return Math.sqrt(s / n)
}

/** RMSE normalizado por el rango de la referencia `x`. */
export function nrmse(x, y) {
  const n = Math.min(x.length, y.length)
  if (n === 0) return 0
  let mn = Infinity, mx = -Infinity
  for (let i = 0; i < n; i++) {
    if (x[i] < mn) mn = x[i]
    if (x[i] > mx) mx = x[i]
  }
  const r = mx - mn
  return r > 0 ? rmse(x, y) / r : 0
}
