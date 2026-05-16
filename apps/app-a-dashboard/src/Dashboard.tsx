import { useState } from 'react';
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

const COLORS = ['#0071e3', '#34c759', '#ff9500', '#ff3b30'];

const stats = [
  { label: 'Ventas totales', value: '$28,060', change: '+12%' },
  { label: 'Clientes activos', value: '1,234', change: '+5%' },
  { label: 'Pedidos pendientes', value: '89', change: '-3%' },
  { label: 'Tasa de conversión', value: '3.2%', change: '+0.8%' },
];

export default function Dashboard() {
  const [timeframe, setTimeframe] = useState('6m');

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Dashboard Comercial</h1>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d2d2d7',
            borderRadius: '6px',
            fontSize: '14px',
            background: 'white',
          }}
        >
          <option value="1m">Último mes</option>
          <option value="3m">Últimos 3 meses</option>
          <option value="6m">Últimos 6 meses</option>
          <option value="1y">Último año</option>
        </select>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
      }}>
        {stats.map((stat) => (
          <div key={stat.label} style={{
            background: 'white',
            border: '1px solid #e8e8ed',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{ fontSize: '13px', color: '#6e6e73', marginBottom: '4px' }}>{stat.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{stat.value}</div>
            <div style={{
              fontSize: '13px',
              color: stat.change.startsWith('+') ? '#34c759' : '#ff3b30',
              marginTop: '4px',
            }}>
              {stat.change} vs periodo anterior
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '16px',
      }}>
        <div style={{
          background: 'white',
          border: '1px solid #e8e8ed',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Ventas vs Gastos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="ventas" fill="#0071e3" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gastos" fill="#ff3b30" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{
          background: 'white',
          border: '1px solid #e8e8ed',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Distribución por categoría</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
              >
                {categoryData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
            {categoryData.map((item, i) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: COLORS[i % COLORS.length] }} />
                {item.name}: {item.value}%
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'white',
          border: '1px solid #e8e8ed',
          borderRadius: '12px',
          padding: '20px',
          gridColumn: '1 / -1',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Tendencia de ventas</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="ventas" stroke="#0071e3" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
