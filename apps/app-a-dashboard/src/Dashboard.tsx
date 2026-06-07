import { useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type Variants } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const monthlyData = [
  { name: 'Ene', ventas: 4000, gastos: 2400 },
  { name: 'Feb', ventas: 3000, gastos: 1398 },
  { name: 'Mar', ventas: 5000, gastos: 3800 },
  { name: 'Abr', ventas: 4780, gastos: 3908 },
  { name: 'May', ventas: 5890, gastos: 4800 },
  { name: 'Jun', ventas: 6390, gastos: 3800 },
];

const categoryData = [
  { name: 'Producto A', value: 35 },
  { name: 'Producto B', value: 25 },
  { name: 'Producto C', value: 20 },
  { name: 'Producto D', value: 20 },
];

const COLORS = ['var(--accent)', 'var(--accent-2)', '#0ea5e9', '#f59e0b'];

const stats = [
  { label: 'Ventas totales', value: '$28,060', change: '+12%' },
  { label: 'Clientes activos', value: '1,234', change: '+5%' },
  { label: 'Pedidos pendientes', value: '89', change: '-3%' },
  { label: 'Tasa de conversión', value: '3.2%', change: '+0.8%' },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const tooltipStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-bright)',
  borderRadius: 10,
  boxShadow: 'var(--elev-3)',
  color: 'var(--text)',
  fontSize: 12,
};

export default function Dashboard() {
  const [timeframe, setTimeframe] = useState('6m');

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 110, damping: 20, mass: 0.4 });
  const sy = useSpring(py, { stiffness: 110, damping: 20, mass: 0.4 });
  const bgX = useTransform(sx, (v) => v * 20);
  const bgY = useTransform(sy, (v) => v * 20);

  const onMove = (e: React.MouseEvent) => {
    px.set(e.clientX / window.innerWidth - 0.5);
    py.set(e.clientY / window.innerHeight - 0.5);
  };

  return (
    <div className="dash" onMouseMove={onMove}>
      <motion.div className="dash-bg" style={{ x: bgX, y: bgY }} />
      <div className="dash-grain" />

      <div className="dash-head">
        <div>
          <h1 className="dash-title">Dashboard Comercial</h1>
          <p className="dash-subtitle">Métricas y reportes de ventas</p>
        </div>
        <select className="select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
          <option value="1m">Último mes</option>
          <option value="3m">Últimos 3 meses</option>
          <option value="6m">Últimos 6 meses</option>
          <option value="1y">Último año</option>
        </select>
      </div>

      <motion.div className="grid-stats" variants={container} initial="hidden" animate="show">
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            className="card"
            variants={item}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            <div className={`stat-change ${stat.change.startsWith('+') ? 'up' : 'down'}`}>
              <span className="stat-trend" />
              {stat.change} vs periodo anterior
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div className="panels" variants={container} initial="hidden" animate="show">
        <motion.div className="card" variants={item}>
          <h3 className="panel-title">Ventas vs Gastos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-hover)' }} />
              <Bar dataKey="ventas" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="gastos" fill="var(--accent-2)" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div className="card" variants={item}>
          <h3 className="panel-title">Distribución por categoría</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={62} outerRadius={100} paddingAngle={3} dataKey="value" stroke="none">
                {categoryData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="legend">
            {categoryData.map((entry, i) => (
              <div key={entry.name} className="legend-item">
                <div className="swatch" style={{ background: COLORS[i % COLORS.length] }} />
                {entry.name}: {entry.value}%
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div className="card panel-wide" variants={item}>
          <h3 className="panel-title">Tendencia de ventas</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border-bright)' }} />
              <Line type="monotone" dataKey="ventas" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--accent)' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </motion.div>
    </div>
  );
}
