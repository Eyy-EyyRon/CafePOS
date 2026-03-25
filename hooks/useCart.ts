import { create } from 'zustand';

export interface Modifier {
  name: string;
  price: number;
}

export interface CartItem {
  cartItemId: string;
  id: string;
  name: string;
  base_price: number;   // final price per unit including modifiers
  quantity: number;
  modifiers: Modifier[];
  note?: string;        // special instructions
}

interface CartStore {
  cart: CartItem[];
  discount: number;
  subtotal: number;
  total: number;
  addItem: (product: any, modifiers: Modifier[]) => void;
  removeItem: (cartItemId: string) => void;
  updateQty: (cartItemId: string, newQty: number) => void;
  setDiscount: (percent: number) => void;
  clearCart: () => void;
}

function recalc(cart: CartItem[], discount: number) {
  const subtotal = cart.reduce((s, i) => s + i.base_price * i.quantity, 0);
  const total    = subtotal * (1 - discount);
  return { subtotal, total };
}

export const useCart = create<CartStore>((set) => ({
  cart:     [],
  discount: 0,
  subtotal: 0,
  total:    0,

  addItem: (product, modifiers = []) => set((state) => {
    const modTotal      = modifiers.reduce((s, m) => s + m.price, 0);
    const finalPrice    = (product.unitPrice ?? product.base_price ?? product.price ?? 0) + modTotal;
    const modStr        = modifiers.map(m => m.name).sort().join(',');
    const noteStr       = product.note ?? '';
    const uniqueCartId  = `${product.id}-${modStr}-${noteStr}`;

    const existingIdx = state.cart.findIndex(i => i.cartItemId === uniqueCartId);
    const newCart     = [...state.cart];

    if (existingIdx >= 0) {
      newCart[existingIdx] = { ...newCart[existingIdx], quantity: newCart[existingIdx].quantity + 1 };
    } else {
      newCart.push({
        cartItemId: uniqueCartId,
        id:         product.id,
        name:       product.name,
        base_price: finalPrice,
        quantity:   1,
        modifiers,
        note:       product.note ?? undefined,
      });
    }

    return { cart: newCart, ...recalc(newCart, state.discount) };
  }),

  removeItem: (cartItemId) => set((state) => {
    const newCart = state.cart.filter(i => i.cartItemId !== cartItemId);
    return { cart: newCart, ...recalc(newCart, state.discount) };
  }),

  updateQty: (cartItemId, newQty) => set((state) => {
    if (newQty < 1) {
      const newCart = state.cart.filter(i => i.cartItemId !== cartItemId);
      return { cart: newCart, ...recalc(newCart, state.discount) };
    }
    const newCart = state.cart.map(i =>
      i.cartItemId === cartItemId ? { ...i, quantity: newQty } : i
    );
    return { cart: newCart, ...recalc(newCart, state.discount) };
  }),

  setDiscount: (percent) => set((state) => ({
    discount: percent,
    total:    state.subtotal * (1 - percent),
  })),

  clearCart: () => set({ cart: [], subtotal: 0, total: 0, discount: 0 }),
}));