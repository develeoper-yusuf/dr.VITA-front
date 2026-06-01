import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
    LogOut, MapPin, LogIn, AlertCircle, CheckCircle2,
    ScanLine, Camera, X, Printer, Receipt, Plus, Minus, Trash2,
    ShoppingCart, Search, Users
} from "lucide-react";


export default function WorkerDashboard() {
    const { user, logout } = useAuth();
    const [products, setProducts] = useState([]);
    const [sales, setSales] = useState([]);
    const [followUps, setFollowUps] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [selectedWorkerId, setSelectedWorkerId] = useState("");
    const [customer, setCustomer] = useState({ name: "", surname: "", phone: "", reason: "" });
    const [cart, setCart] = useState([]); // [{product, quantity, discountOverride}]
    const [busy, setBusy] = useState(false);
    const [openScanner, setOpenScanner] = useState(false);
    const [scannedProduct, setScannedProduct] = useState(null);
    const [scannedProducts, setScannedProducts] = useState([]); // bir QR kodda bir nechta mahsulot
    const [lastReceipt, setLastReceipt] = useState(null);
    const [productSearch, setProductSearch] = useState("");
    const [customersFilter, setCustomersFilter] = useState("today"); // today | month | all

    const load = useCallback(async () => {
        const [p, s, f, a, w] = await Promise.all([
            api.get("/products"), api.get("/sales/mine"), api.get("/sales/follow-ups"), api.get("/attendance/mine"),
            api.get("/users/workers").catch(() => ({ data: [] })),
        ]);
        setProducts(p.data); setSales(s.data); setFollowUps(f.data); setAttendance(a.data);
        setWorkers(w.data);
    }, []);

    useEffect(() => { load(); }, [load]);

    // ===== Cart utilities =====
    const finalPriceOf = (product, extraDisc = 0) => {
        const base = Number(product.price || 0);
        const baseDisc = Number(product.discount_percent || 0);
        const total = Math.min(baseDisc + Number(extraDisc || 0), 100);
        return Math.round(base * (100 - total) / 100);
    };

    const addToCart = useCallback((product, qty = 1) => {
        const stock = Number(product.stock ?? 0);
        if (stock <= 0) {
            toast.error(`"${product.name}" tugagan — sotib bo'lmaydi (0 ta qolgan)`);
            return;
        }
        setCart(prev => {
            const existing = prev.find(c => c.product.id === product.id);
            if (existing) {
                const newQty = existing.quantity + qty;
                if (newQty > stock) {
                    toast.error(`Omborda atigi ${stock} ta bor`);
                    return prev;
                }
                return prev.map(c => c.product.id === product.id ? { ...c, quantity: newQty } : c);
            }
            return [...prev, { product, quantity: qty, discountOverride: 0, optomMode: false, optomInput: "" }];
        });
        toast.success(`"${product.name}" savatga qo'shildi`);
    }, []);

    const updateCartItem = (idx, patch) => {
        setCart(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
    };
    const removeFromCart = (idx) => setCart(prev => prev.filter((_, i) => i !== idx));

    const cartTotal = cart.reduce((sum, c) => sum + finalPriceOf(c.product, c.discountOverride) * c.quantity, 0);
    const cartDiscount = cart.reduce((sum, c) => {
        const base = Number(c.product.price || 0);
        return sum + (base - finalPriceOf(c.product, c.discountOverride)) * c.quantity;
    }, 0);

    // ===== Always-on hardware scanner =====
    // Worker dashboard ochiq paytda — barkod skaner urilsa, mahsulot avtomatik savatga qo'shiladi.
    const scanBuf = useRef("");
    const scanT = useRef(null);
    useEffect(() => {
        const onKey = (e) => {
            if (openScanner) return;
            const tag = (e.target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return;
            if (e.key === "Enter") {
                const code = scanBuf.current.trim();
                scanBuf.current = "";
                clearTimeout(scanT.current);
                if (code && code.length >= 4) handleScannedCode(code);
            } else if (e.key.length === 1) {
                scanBuf.current += e.key;
                clearTimeout(scanT.current);
                scanT.current = setTimeout(() => { scanBuf.current = ""; }, 250);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openScanner]);

    const handleScannedCode = async (code) => {
        try {
            const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(code)}`);
            // Backend endi array qaytaradi
            const arr = Array.isArray(data) ? data : [data];
            if (openScanner) {
                // Scanner panelida — birinchi mahsulotni ko'rsatamiz, barchasi scannedProducts'da
                setScannedProduct(arr[0]);
                setScannedProducts(arr);
            } else {
                // Hardware scanner — barcha mahsulotlarni savatga qo'shish uchun tanlash
                if (arr.length === 1) {
                    addToCart(arr[0], 1);
                } else {
                    // Bir nechta bo'lsa scanner panelini ochamiz
                    setScannedProduct(arr[0]);
                    setScannedProducts(arr);
                    setOpenScanner(true);
                }
            }
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Mahsulot topilmadi");
        }
    };

    // Argument bilan chaqirilsa — o'sha mahsulotni qo'shadi, yo'q bo'lsa — tanlangan birinchisini
    const selectScannedAsCart = (product) => {
        const p = product || scannedProduct;
        if (!p) return;
        addToCart(p, 1);
        setOpenScanner(false);
        setScannedProduct(null);
        setScannedProducts([]);
    };

    // ===== Submit multi-product sale =====
    const submitSale = async (e) => {
        e.preventDefault();
        if (cart.length === 0) return toast.error("Savat bo'sh");
        if (!customer.name.trim()) return toast.error("Mijoz ismini kiriting");
        if (!selectedWorkerId) return toast.error("Sotuvchini tanlang");
        setBusy(true);
        try {
            const payload = {
                customer_name: customer.name,
                customer_surname: customer.surname,
                customer_phone: customer.phone,
                reason: customer.reason,
                worker_id: selectedWorkerId,
                items: cart.map(c => ({
                    product_id: c.product.id,
                    quantity: Number(c.quantity),
                    discount_override: Number(c.discountOverride) || 0,
                })),
            };
            const { data } = await api.post("/sales/multi", payload);
            toast.success("Sotuv qayd etildi");
            setLastReceipt({
                ...data,
                items_view: cart.map(c => ({
                    name: c.product.name,
                    quantity: c.quantity,
                    unit_price: Number(c.product.price || 0),
                    final_unit: finalPriceOf(c.product, c.discountOverride),
                    discount_pct: Math.min(Number(c.product.discount_percent || 0) + Number(c.discountOverride || 0), 100),
                    line_total: finalPriceOf(c.product, c.discountOverride) * c.quantity,
                })),
                grand_total: cartTotal,
                grand_discount: cartDiscount,
            });
            setCart([]);
            setCustomer({ name: "", surname: "", phone: "", reason: "" });
            await load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setBusy(false); }
    };

    // ===== Receipt print =====
    const printReceipt = (receipt) => {
        const win = window.open("", "_blank", "width=380,height=700");
        if (!win) { toast.error("Pop-up bloklangan"); return; }
        const rows = receipt.items_view.map(it => `
            <div class="row"><span>${it.name} × ${it.quantity}</span><span>${it.line_total.toLocaleString()} so'm</span></div>
            ${it.discount_pct > 0 ? `<div class="row small"><span>&nbsp;&nbsp;chegirma ${it.discount_pct}%</span><span></span></div>` : ""}
        `).join("");
        win.document.write(`
        <html><head><title>Chek</title>
        <style>
            body { font-family: monospace; font-size: 13px; padding: 20px; max-width: 320px; margin: 0 auto; color:#1a1a1a; }
            h2 { text-align: center; font-size: 20px; margin-bottom: 2px; }
            .sub { text-align: center; color: #888; font-size: 11px; margin-bottom: 14px; }
            hr { border: none; border-top: 1px dashed #aaa; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 3px 0; }
            .small { font-size: 11px; color: #777; }
            .total { font-size: 17px; font-weight: bold; }
            .footer { text-align: center; color: #aaa; font-size: 10px; margin-top: 16px; }
            .worker { background: #f7f3ee; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; text-align: center; font-size: 11px; }
        </style></head>
        <body>
        <h2>Doctor·VITA</h2>
        <div class="sub">Chek</div>
        <div class="worker">
            <div style="font-size:9px; letter-spacing:1px; color:#888;">SOTUVCHI</div>
            <div style="font-weight:bold; font-size:13px;">${receipt.worker_name || "—"}</div>
        </div>
        <hr/>
        <div class="row"><span>Sana:</span><span>${new Date(receipt.created_at).toLocaleString()}</span></div>
        <div class="row"><span>Mijoz:</span><span>${receipt.customer_name} ${receipt.customer_surname || ""}</span></div>
        ${receipt.customer_phone ? `<div class="row"><span>Telefon:</span><span>${receipt.customer_phone}</span></div>` : ""}
        <hr/>
        ${rows}
        <hr/>
        ${receipt.grand_discount > 0 ? `<div class="row small"><span>Jami chegirma:</span><span>−${receipt.grand_discount.toLocaleString()} so'm</span></div>` : ""}
        <div class="row total"><span>JAMI:</span><span>${receipt.grand_total.toLocaleString()} so'm</span></div>
        <hr/>
        <div class="footer">Xaridingiz uchun rahmat! 🌸</div>
        </body></html>`);
        win.document.close();
        win.print();
    };

    const punch = (type) => {
        if (!navigator.geolocation) return toast.error("Geolokatsiya qo'llab-quvvatlanmaydi");
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const { data } = await api.post("/attendance", { type, location: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
                if (data.is_late) toast.warning("Kech keldingiz! Direktorga xabar yuborildi.");
                else if (data.is_early) toast.success("Erta keldingiz - yashang!");
                else toast.success(type === "checkin" ? "Ishga keldingiz" : "Ishni tugatdingiz");
                await load();
            } catch (e) {
                toast.error(formatApiError(e.response?.data?.detail) || e.message);
            }
        }, () => toast.error("Joylashuvni olib bo'lmadi"));
    };

    const markFollowDone = async (id) => {
        try { await api.post(`/sales/${id}/follow-up-done`); toast.success("Qayd etildi"); await load(); }
        catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    };

    // Customers list (grouped by phone)
    const customersGrouped = (() => {
        const filtered = sales.filter(s => {
            const d = new Date(s.created_at);
            const now = new Date();
            if (customersFilter === "today") return d.toDateString() === now.toDateString();
            if (customersFilter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            return true;
        });
        const map = new Map();
        for (const s of filtered) {
            const key = s.customer_phone || `${s.customer_name}_${s.customer_surname}`;
            if (!map.has(key)) {
                map.set(key, { name: s.customer_name, surname: s.customer_surname, phone: s.customer_phone, count: 0, total: 0, last: s.created_at });
            }
            const c = map.get(key);
            c.count += 1;
            c.total += Number(s.total || 0);
            if (s.created_at > c.last) c.last = s.created_at;
        }
        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    })();

    const todayCount = sales.filter(s => s.created_at.slice(0,10) === new Date().toISOString().slice(0,10)).length;
    const todayRev = sales.filter(s => s.created_at.slice(0,10) === new Date().toISOString().slice(0,10))
        .reduce((sum, s) => sum + (s.total || 0), 0);
    const totalRev = sales.reduce((sum, s) => sum + (s.total || 0), 0);

    const visibleProducts = products.filter(p =>
        !productSearch.trim() ||
        p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.category?.toLowerCase().includes(productSearch.toLowerCase())
    ).slice(0, 60);

    return (
        <div className="bg-ivory min-h-screen" data-testid="worker-dashboard">
            <header className="border-b border-line bg-white/80 backdrop-blur-md sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-noir text-ivory flex items-center justify-center font-serif">{user.name?.[0] || "I"}</div>
                        <div>
                            <div className="font-serif text-lg text-noir leading-none">Salom, {user.name} {user.surname || ""}</div>
                            <div className="text-xs text-stone">Sotuvchi paneli</div>
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                        <div className="text-xs text-stone bg-cream rounded-full px-3 py-1.5 flex items-center gap-1">
                            <ScanLine className="w-3.5 h-3.5 text-rose"/> Skaner doim faol
                        </div>
                        <Button onClick={() => { setScannedProduct(null); setOpenScanner(true); }} variant="outline" className="border-rose text-rose hover:bg-rose hover:text-ivory rounded-full" data-testid="open-scanner">
                            <Camera className="w-4 h-4 mr-1"/> Kamera
                        </Button>
                        <Button onClick={() => punch("checkin")} className="bg-noir text-ivory hover:bg-rose rounded-full" data-testid="checkin-btn">
                            <LogIn className="w-4 h-4 mr-1" /> Ishga keldim
                        </Button>
                        <Button variant="ghost" onClick={logout} data-testid="logout-btn"><LogOut className="w-4 h-4" /></Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 md:px-10 py-8 space-y-8">
                <Tabs defaultValue="register">
                    <TabsList className="bg-cream">
                        <TabsTrigger value="register" data-testid="tab-register">Sotuv (Savat)</TabsTrigger>
                        <TabsTrigger value="customers" data-testid="tab-customers">Mijozlarim</TabsTrigger>
                        <TabsTrigger value="mine" data-testid="tab-mine">Sotuvlar tarixi</TabsTrigger>
                        <TabsTrigger value="follow" data-testid="tab-follow">
                            Follow-up {followUps.length > 0 && <span className="ml-2 text-xs bg-rose text-ivory rounded-full px-2 py-0.5">{followUps.length}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="att" data-testid="tab-att">Davomat</TabsTrigger>
                    </TabsList>

                    {/* ============ SAVAT ============ */}
                    <TabsContent value="register" className="mt-6">
                        <div className="grid lg:grid-cols-5 gap-6">
                            {/* Mahsulotlar tanlash */}
                            <div className="lg:col-span-3 bg-white rounded-2xl border border-line p-5">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                    <div className="font-serif text-lg text-noir">Mahsulot tanlash</div>
                                    <div className="text-xs text-stone">Barkodni skanerda ursangiz — to'g'ridan-to'g'ri savatga qo'shiladi</div>
                                </div>
                                <div className="relative mb-3">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone"/>
                                    <Input
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder="Mahsulot qidirish..."
                                        className="pl-9"
                                        data-testid="product-search"
                                    />
                                </div>
                                <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2" data-testid="product-list">
                                    {visibleProducts.map(p => {
                                        const finalP = p.final_price ?? p.price;
                                        const disc = Number(p.discount_percent || 0);
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => addToCart(p, 1)}
                                                disabled={Number(p.stock ?? 0) <= 0}
                                                className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all text-left ${Number(p.stock ?? 0) <= 0 ? 'border-line bg-gray-50 opacity-50 cursor-not-allowed' : 'border-line hover:border-rose hover:bg-rose/5'}`}
                                                data-testid={`pick-product-${p.id}`}
                                            >
                                                <img src={p.image_url} alt={p.name} className="w-12 h-12 object-cover rounded-lg bg-cream"/>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-serif text-sm text-noir line-clamp-1">{p.name}</div>
                                                    <div className="text-xs text-stone">
                                                        {Number(finalP).toLocaleString()} so'm
                                                        {disc > 0 && <span className="text-rose ml-1">−{disc}%</span>}
                                                        <span className={`ml-2 font-semibold ${Number(p.stock ?? 0) <= 0 ? 'text-rose' : ''}`}>
                                                            · {Number(p.stock ?? 0) <= 0 ? 'Tugagan' : `${p.stock} ta`}
                                                        </span>
                                                    </div>
                                                </div>
                                                {Number(p.stock ?? 0) <= 0 ? <span className="text-xs text-rose font-bold">0</span> : <Plus className="w-4 h-4 text-rose"/>}
                                            </button>
                                        );
                                    })}
                                    {visibleProducts.length === 0 && (
                                        <div className="text-stone text-sm text-center py-8">Mahsulot topilmadi</div>
                                    )}
                                </div>
                            </div>

                            {/* Savat va mijoz */}
                            <div className="lg:col-span-2 space-y-4">
                                <form onSubmit={submitSale} className="bg-white rounded-2xl border border-line p-5 space-y-3" data-testid="sale-form">
                                    <div className="flex items-center gap-2 mb-1">
                                        <ShoppingCart className="w-5 h-5 text-rose"/>
                                        <div className="font-serif text-lg text-noir">Savat ({cart.length})</div>
                                    </div>
                                    {cart.length === 0 ? (
                                        <div className="text-stone text-sm text-center py-8 border-2 border-dashed border-line rounded-xl">
                                            Savat bo'sh — mahsulotni bosing yoki barkodni skanerda o'qing
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1" data-testid="cart-items">
                                            {cart.map((c, idx) => {
                                                const baseDisc = Number(c.product.discount_percent || 0);
                                                const totalDisc = Math.min(baseDisc + Number(c.discountOverride || 0), 100);
                                                const unit = finalPriceOf(c.product, c.discountOverride);
                                                const originalUnit = Number(c.product.price || 0);
                                                return (
                                                    <div key={idx} className="bg-white border border-line rounded-xl overflow-hidden" data-testid={`cart-item-${idx}`}>
                                                        {/* Mahsulot info */}
                                                        <div className="flex items-center gap-2 p-2.5">
                                                            <img src={c.product.image_url} alt="" className="w-10 h-10 object-cover rounded-lg bg-cream flex-shrink-0"/>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-sm text-noir line-clamp-1">{c.product.name}</div>
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    {totalDisc > 0 && (
                                                                        <span className="text-[10px] text-stone line-through">{originalUnit.toLocaleString()}</span>
                                                                    )}
                                                                    <span className="text-xs font-semibold text-noir">{unit.toLocaleString()} so'm</span>
                                                                    {totalDisc > 0 && (
                                                                        <span className="text-[10px] bg-rose/10 text-rose rounded px-1 py-0.5">−{totalDisc}%</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button type="button" onClick={() => removeFromCart(idx)} className="text-stone hover:text-rose transition-colors p-1" data-testid={`cart-remove-${idx}`}>
                                                                <Trash2 className="w-3.5 h-3.5"/>
                                                            </button>
                                                        </div>

                                                        {/* Miqdor + Chegirma */}
                                                        <div className="border-t border-line/60 bg-cream/50 px-2.5 py-2 flex items-center gap-2">
                                                            {/* Miqdor */}
                                                            <div className="flex items-center rounded-lg border border-line bg-white overflow-hidden">
                                                                <button type="button" onClick={() => updateCartItem(idx, { quantity: Math.max(1, c.quantity - 1) })} className="w-7 h-7 flex items-center justify-center hover:bg-rose hover:text-ivory transition-colors text-stone">
                                                                    <Minus className="w-3 h-3"/>
                                                                </button>
                                                                <input
                                                                    type="number"
                                                                    min={1}
                                                                    value={c.quantity}
                                                                    onChange={(e) => updateCartItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                                                    className="w-9 text-center text-sm font-semibold border-0 bg-transparent focus:outline-none text-noir"
                                                                    data-testid={`cart-qty-${idx}`}
                                                                />
                                                                <button type="button" onClick={() => updateCartItem(idx, { quantity: c.quantity + 1 })} className="w-7 h-7 flex items-center justify-center hover:bg-rose hover:text-ivory transition-colors text-stone">
                                                                    <Plus className="w-3 h-3"/>
                                                                </button>
                                                            </div>

                                                            <div className="text-xs text-stone">×</div>

                                                            {/* Chegirma tugmalari */}
                                                            <div className="flex items-center gap-1 flex-1 flex-wrap">
                                                                {[0, 1, 2, 3, 5, 10].map(pct => (
                                                                    <button
                                                                        key={pct}
                                                                        type="button"
                                                                        onClick={() => updateCartItem(idx, { discountOverride: pct, optomMode: false, optomInput: "" })}
                                                                        className={`h-6 px-2 rounded text-[11px] font-medium transition-all border ${
                                                                            Number(c.discountOverride || 0) === pct
                                                                                ? "bg-rose text-ivory border-rose"
                                                                                : "bg-white border-line text-stone hover:border-rose hover:text-rose"
                                                                        }`}
                                                                    >
                                                                        {pct === 0 ? "0%" : `+${pct}%`}
                                                                    </button>
                                                                ))}
                                                                {/* Optom — so'mda */}
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        placeholder="so'm"
                                                                        value={c.optomInput || ""}
                                                                        onChange={(e) => {
                                                                            const val = Number(e.target.value || 0);
                                                                            const base = Number(c.product.price || 0);
                                                                            const pct = base > 0 ? Math.min((val / base) * 100, 100) : 0;
                                                                            updateCartItem(idx, { optomInput: e.target.value, optomMode: true, discountOverride: pct });
                                                                        }}
                                                                        className="h-6 w-20 px-2 text-[11px] rounded border border-line bg-white focus:outline-none focus:border-rose text-noir placeholder:text-stone/50"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Jami */}
                                                        <div className="px-2.5 py-1.5 flex justify-end">
                                                            <span className="text-xs font-bold text-noir">{(unit * c.quantity).toLocaleString()} so'm</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {cart.length > 0 && (
                                        <div className="border-t border-line pt-3 space-y-1 text-sm">
                                            {cartDiscount > 0 && (
                                                <div className="flex justify-between text-stone">
                                                    <span>Chegirma:</span>
                                                    <span className="text-rose">−{cartDiscount.toLocaleString()} so'm</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between font-bold text-base text-noir">
                                                <span>Jami:</span>
                                                <span>{cartTotal.toLocaleString()} so'm</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="border-t border-line pt-3 space-y-2">
                                        <Label className="text-xs">Sotuvchi</Label>
                                        <select
                                            value={selectedWorkerId}
                                            onChange={(e) => setSelectedWorkerId(e.target.value)}
                                            data-testid="worker-select"
                                            className="w-full h-10 rounded-md border border-line bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose/40"
                                        >
                                            <option value="">— Sotuvchini tanlang —</option>
                                            {workers.map(w => (
                                                <option key={w.id} value={String(w.id)}>
                                                    {w.name} {w.surname || ""}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="border-t border-line pt-3 space-y-2">
                                        <Label className="text-xs">Mijoz ma'lumotlari</Label>
                                        <Input data-testid="c-name" placeholder="Ismi" value={customer.name} onChange={(e) => setCustomer({...customer, name: e.target.value})} required/>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input data-testid="c-surname" placeholder="Familiyasi" value={customer.surname} onChange={(e) => setCustomer({...customer, surname: e.target.value})}/>
                                            <Input data-testid="c-phone" placeholder="Telefon" value={customer.phone} onChange={(e) => setCustomer({...customer, phone: e.target.value})}/>
                                        </div>
                                        <Textarea data-testid="c-reason" placeholder="Sabab / izoh (ixtiyoriy)" rows={2} value={customer.reason} onChange={(e) => setCustomer({...customer, reason: e.target.value})}/>
                                    </div>

                                    <Button type="submit" disabled={busy || cart.length === 0} className="w-full bg-noir text-ivory hover:bg-rose rounded-full h-11" data-testid="s-submit">
                                        Saqlash va chek chiqarish
                                    </Button>
                                </form>
                            </div>
                        </div>

                        {/* Oxirgi chek */}
                        {lastReceipt && (
                            <div className="mt-6 max-w-md bg-white border-2 border-dashed border-line rounded-2xl p-5 space-y-3" data-testid="last-receipt">
                                <div className="flex items-center justify-between">
                                    <div className="font-serif text-lg text-noir flex items-center gap-2">
                                        <Receipt className="w-5 h-5 text-rose"/> Chek
                                    </div>
                                    <Button size="sm" onClick={() => printReceipt(lastReceipt)} className="bg-noir text-ivory hover:bg-rose rounded-full">
                                        <Printer className="w-4 h-4 mr-1"/> Chop etish
                                    </Button>
                                </div>
                                <div className="font-mono text-xs space-y-1 border-t border-dashed border-line pt-3">
                                    <div className="bg-cream rounded-md p-2 text-center mb-2">
                                        <div className="text-[10px] text-stone uppercase tracking-widest">Sotuvchi</div>
                                        <div className="font-bold text-noir">{lastReceipt.worker_name}</div>
                                    </div>
                                    <div className="flex justify-between"><span>Sana:</span><span>{new Date(lastReceipt.created_at).toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span>Mijoz:</span><span>{lastReceipt.customer_name} {lastReceipt.customer_surname}</span></div>
                                    {lastReceipt.customer_phone && <div className="flex justify-between"><span>Tel:</span><span>{lastReceipt.customer_phone}</span></div>}
                                    <div className="border-t border-dashed border-line my-1"/>
                                    {lastReceipt.items_view.map((it, i) => (
                                        <React.Fragment key={i}>
                                            <div className="flex justify-between"><span>{it.name} × {it.quantity}</span><span>{it.line_total.toLocaleString()}</span></div>
                                            {it.discount_pct > 0 && <div className="flex justify-between text-rose text-[10px]"><span>&nbsp;&nbsp;chegirma:</span><span>−{it.discount_pct}%</span></div>}
                                        </React.Fragment>
                                    ))}
                                    <div className="border-t border-dashed border-line my-1"/>
                                    {lastReceipt.grand_discount > 0 && (
                                        <div className="flex justify-between text-rose"><span>Jami chegirma:</span><span>−{lastReceipt.grand_discount.toLocaleString()} so'm</span></div>
                                    )}
                                    <div className="flex justify-between font-bold text-sm"><span>JAMI:</span><span>{lastReceipt.grand_total.toLocaleString()} so'm</span></div>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ============ MIJOZLARIM ============ */}
                    <TabsContent value="customers" className="mt-6">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-rose"/>
                                <h3 className="font-serif text-xl text-noir">Mijozlarim</h3>
                            </div>
                            <div className="flex gap-1 bg-cream rounded-full p-1">
                                {[
                                    { v: "today", l: "Bugun" },
                                    { v: "month", l: "Shu oy" },
                                    { v: "all", l: "Hammasi" },
                                ].map(o => (
                                    <button
                                        key={o.v}
                                        onClick={() => setCustomersFilter(o.v)}
                                        className={`px-3 py-1.5 text-sm rounded-full transition ${customersFilter === o.v ? "bg-noir text-ivory" : "text-stone hover:text-noir"}`}
                                        data-testid={`customers-filter-${o.v}`}
                                    >
                                        {o.l}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-line overflow-hidden">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead>Ism familiya</TableHead><TableHead>Telefon</TableHead><TableHead>Sotuvlar soni</TableHead><TableHead>Jami</TableHead><TableHead>Oxirgi</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {customersGrouped.map((c, i) => (
                                        <TableRow key={i} data-testid={`customer-row-${i}`}>
                                            <TableCell className="font-serif text-base">{c.name} {c.surname}</TableCell>
                                            <TableCell>{c.phone || "—"}</TableCell>
                                            <TableCell>{c.count}</TableCell>
                                            <TableCell className="font-semibold">{c.total.toLocaleString()} so'm</TableCell>
                                            <TableCell className="text-xs text-stone">{new Date(c.last).toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                    {customersGrouped.length === 0 && <TableRow><TableCell colSpan={5} className="text-stone text-center py-10">Bu davrda mijozlar yo'q</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    {/* ============ SOTUVLAR TARIXI ============ */}
                    <TabsContent value="mine" className="mt-6">
                        <div className="bg-white rounded-2xl border border-line overflow-hidden">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead>Sana</TableHead><TableHead>Mijoz</TableHead><TableHead>Telefon</TableHead><TableHead>Mahsulot</TableHead><TableHead>Soni</TableHead><TableHead>Chegirma</TableHead><TableHead>Jami</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {sales.map(s => (
                                        <TableRow key={s.id} data-testid={`sale-row-${s.id}`}>
                                            <TableCell className="text-sm">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell>{s.customer_name} {s.customer_surname}</TableCell>
                                            <TableCell>{s.customer_phone}</TableCell>
                                            <TableCell>{s.product_name}</TableCell>
                                            <TableCell>{s.quantity}</TableCell>
                                            <TableCell>
                                                {Number(s.discount_total || 0) > 0 ? (
                                                    <span className="text-rose text-sm">−{Number(s.discount_total).toLocaleString()}</span>
                                                ) : <span className="text-stone text-xs">—</span>}
                                            </TableCell>
                                            <TableCell>{Number(s.total).toLocaleString()} so'm</TableCell>
                                        </TableRow>
                                    ))}
                                    {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-stone text-center py-10">Hali sotuvlar yo'q</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="follow" className="mt-6">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <div>
                                <h3 className="font-serif text-xl text-noir">30-kun follow-up</h3>
                                <p className="text-stone text-sm">30 kundan oshgan barcha mijozlar bilan qayta bog'laning</p>
                            </div>
                            {followUps.length > 0 && (
                                <span className="bg-rose text-ivory text-sm px-3 py-1 rounded-full">{followUps.length} ta kutmoqda</span>
                            )}
                        </div>
                        <div className="space-y-3">
                            {followUps.map(s => (
                                <div key={s.id} className="bg-white rounded-xl border border-line p-4 flex items-center justify-between gap-4" data-testid={`followup-${s.id}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-lg text-noir">{s.customer_name} {s.customer_surname}</div>
                                        <div className="text-sm text-stone flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                            <span>{s.customer_phone}</span>
                                            <span>· {s.product_name}</span>
                                            <span>· {new Date(s.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={() => markFollowDone(s.id)} className="bg-noir text-ivory hover:bg-rose rounded-full whitespace-nowrap" data-testid={`followup-done-${s.id}`}>
                                        <CheckCircle2 className="w-4 h-4 mr-1" /> Bog'landim
                                    </Button>
                                </div>
                            ))}
                            {followUps.length === 0 && (
                                <div className="text-stone bg-cream rounded-xl p-8 text-center">
                                    <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                                    Hozircha qayta bog'lanish kerak bo'lgan mijozlar yo'q.
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="att" className="mt-6">
                        <div className="bg-white rounded-2xl border border-line overflow-hidden">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead>Sana</TableHead><TableHead>Vaqt</TableHead><TableHead>Turi</TableHead><TableHead>Holat</TableHead><TableHead>Lokatsiya</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {attendance.map(a => (
                                        <TableRow key={a.id}>
                                            <TableCell>{new Date(a.timestamp).toLocaleDateString()}</TableCell>
                                            <TableCell>{a.local_time}</TableCell>
                                            <TableCell>{a.type === "checkin" ? "Kelish" : "Ketish"}</TableCell>
                                            <TableCell>
                                                {a.is_late ? <span className="text-rose flex items-center gap-1"><AlertCircle className="w-4 h-4"/>Kech</span>
                                                : a.is_early ? <span className="text-noir">Erta</span>
                                                : <span className="text-stone">O'z vaqtida</span>}
                                            </TableCell>
                                            <TableCell className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3"/>{a.location.lat.toFixed(4)}, {a.location.lng.toFixed(4)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {attendance.length === 0 && <TableRow><TableCell colSpan={5} className="text-stone text-center py-10">Davomat yozuvlari yo'q</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                </Tabs>
            </main>

            {/* Camera Scanner Dialog */}
            <Dialog open={openScanner} onOpenChange={(v) => { setOpenScanner(v); if (!v) setScannedProduct(null); }}>
                <DialogContent className="bg-ivory border-line rounded-2xl max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl text-noir flex items-center gap-2">
                            <ScanLine className="w-6 h-6 text-rose"/> Kamera skaneri
                        </DialogTitle>
                        <DialogDescription className="text-stone text-sm">
                            Kamerani yoqing yoki barkodni qo'lda kiriting. Hardware skaner ham doim faol.
                        </DialogDescription>
                    </DialogHeader>
                    <ScannerPanel
                        onCode={handleScannedCode}
                        scannedProduct={scannedProduct}
                        scannedProducts={scannedProducts}
                        onClose={() => { setOpenScanner(false); setScannedProduct(null); setScannedProducts([]); }}
                        onUseInSale={selectScannedAsCart}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ====== Camera Scanner Panel ====== */
function ScannerPanel({ onCode, scannedProduct, scannedProducts, onClose, onUseInSale }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const [camActive, setCamActive] = useState(false);
    const [manualCode, setManualCode] = useState("");
    const [supported, setSupported] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
        return () => stopCamera();
        // eslint-disable-next-line
    }, []);

    const startCamera = async () => {
        setError("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setCamActive(true);
            if (supported) detectLoop();
        } catch (e) {
            setError("Kameraga kirib bo'lmadi: " + e.message);
        }
    };

    const stopCamera = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        if (videoRef.current) videoRef.current.srcObject = null;
        setCamActive(false);
    };

    const detectLoop = async () => {
        try {
            // eslint-disable-next-line no-undef
            const detector = new window.BarcodeDetector({
                formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf", "codabar", "data_matrix"],
            });
            const tick = async () => {
                if (!videoRef.current || videoRef.current.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
                try {
                    const codes = await detector.detect(videoRef.current);
                    if (codes && codes.length > 0) {
                        stopCamera();
                        onCode(codes[0].rawValue);
                        return;
                    }
                } catch {}
                rafRef.current = requestAnimationFrame(tick);
            };
            tick();
        } catch (e) {
            setError("BarcodeDetector ishlamadi: " + e.message);
        }
    };

    const submitManual = (e) => {
        e.preventDefault();
        if (!manualCode.trim()) return;
        onCode(manualCode.trim());
    };

    const allScanned = (scannedProducts && scannedProducts.length > 0) ? scannedProducts : (scannedProduct ? [scannedProduct] : []);

    if (allScanned.length > 0) {
        return (
            <div className="space-y-4 animate-fade-in">
                {allScanned.length > 1 && (
                    <div className="text-sm font-semibold text-noir bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        🔍 Bu QR kodda {allScanned.length} ta mahsulot topildi — birini tanlang:
                    </div>
                )}
                {allScanned.map((sp, idx) => {
                    const hasDisc = Number(sp.discount_percent || 0) > 0;
                    const finalP = sp.final_price ?? sp.price;
                    const outOfStock = Number(sp.stock ?? 0) <= 0;
                    return (
                        <div key={sp.id} className={`bg-white rounded-2xl overflow-hidden ${sp.parent_barcode ? 'border-2 border-amber-300' : 'border border-line'}`}>
                            {sp.parent_barcode && (
                                <div className="bg-amber-50 border-b border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
                                    🔄 O'zgartirilgan variant
                                </div>
                            )}
                            <div className="flex items-center gap-3 p-3">
                                <img src={sp.image_url} alt={sp.name} className="w-16 h-16 object-cover rounded-xl bg-cream flex-shrink-0"/>
                                <div className="flex-1 min-w-0 space-y-0.5">
                                    <h3 className="font-serif text-base text-noir line-clamp-1">{sp.name}</h3>
                                    <div className="text-xs text-stone">{sp.category}</div>
                                    <div className="text-xs text-noir font-semibold">
                                        {hasDisc ? (
                                            <span>{Number(finalP).toLocaleString()} <span className="text-rose">−{sp.discount_percent}%</span></span>
                                        ) : (
                                            <span>{Number(sp.price).toLocaleString()} so'm</span>
                                        )}
                                    </div>
                                    <div className={`text-xs font-semibold ${outOfStock ? 'text-rose' : 'text-stone'}`}>
                                        {outOfStock ? '❌ Tugagan (0 ta)' : `📦 ${sp.stock} dona`}
                                    </div>
                                </div>
                                <Button
                                    onClick={() => onUseInSale(sp)}
                                    disabled={outOfStock}
                                    className={`rounded-full text-xs px-3 ${outOfStock ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-noir text-ivory hover:bg-rose'}`}
                                >
                                    <Plus className="w-3 h-3 mr-1"/> Qo'shish
                                </Button>
                            </div>
                        </div>
                    );
                })}
                <Button onClick={onClose} variant="outline" className="w-full rounded-full">Yopish</Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="scanner-frame relative aspect-[4/3] bg-noir/95 overflow-hidden">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                {camActive && <div className="scanner-line animate-scanner-line"/>}
                {!camActive && (
                    <div className="absolute inset-0 flex items-center justify-center text-ivory/70 text-sm flex-col gap-2">
                        <Camera className="w-12 h-12"/>
                        <span>Kamera o'chirilgan</span>
                    </div>
                )}
            </div>
            {error && <div className="text-sm text-rose bg-rose/10 rounded-md p-3">{error}</div>}
            {!supported && (
                <div className="text-xs text-stone bg-cream rounded-md p-3">
                    Brauzeringiz avtomatik skaner (BarcodeDetector) ni qo'llab-quvvatlamaydi. Kodni qo'lda kiriting.
                </div>
            )}
            <div className="flex gap-2">
                {!camActive ? (
                    <Button onClick={startCamera} className="bg-rose text-ivory hover:bg-noir rounded-full flex-1">
                        <Camera className="w-4 h-4 mr-2"/> Kamerani yoqish
                    </Button>
                ) : (
                    <Button onClick={stopCamera} variant="outline" className="rounded-full flex-1">
                        <X className="w-4 h-4 mr-2"/> To'xtatish
                    </Button>
                )}
            </div>
            <div className="text-center text-xs text-stone">— yoki —</div>
            <form onSubmit={submitManual} className="flex gap-2">
                <Input value={manualCode} onChange={(e)=>setManualCode(e.target.value)} placeholder="Kodni qo'lda kiriting…" />
                <Button type="submit" className="bg-noir text-ivory hover:bg-rose rounded-full">Qidirish</Button>
            </form>
        </div>
    );
}
