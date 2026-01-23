'use client';

export default function TestSimplePage() {
  return (
    <div style={{ padding: '20px', background: 'red', color: 'white' }}>
      <h1>测试页面 - 如果看到这个红色背景说明 React 工作了</h1>
      <p>当前时间: {new Date().toLocaleTimeString()}</p>
    </div>
  );
}
