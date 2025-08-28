# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

# BitChat PWA

A modern, responsive Progressive Web Application (PWA) built with React, TypeScript, and Vite. BitChat provides a clean, intuitive chat interface with PWA capabilities for offline usage and mobile installation.

## Features

- 🚀 **PWA Support**: Install as a native app on mobile and desktop
- 💬 **Real-time Chat Interface**: Modern chat UI with message timestamps
- 👤 **User Profile Management**: Customizable username with avatar
- 📱 **Responsive Design**: Works seamlessly on all devices
- ⚡ **Fast Performance**: Built with Vite for optimal development and production performance
- 🎨 **Modern UI**: Clean, gradient-based design with smooth animations
- 🔄 **Auto-update**: Service worker automatically updates the app

## Technology Stack

- **React 18** - Modern React with hooks
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and development server
- **PWA Plugin** - Progressive Web App capabilities
- **CSS3** - Modern styling with gradients and animations

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bitchatWeb
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── ChatWindow.tsx      # Main chat interface
│   ├── ChatWindow.css      # Chat styles
│   ├── UserProfile.tsx     # User profile component
│   └── UserProfile.css     # Profile styles
├── App.tsx                 # Main application component
├── App.css                 # Application styles
├── index.css               # Global styles
└── main.tsx               # Application entry point
```

## Features Overview

### Chat Interface
- Send and receive messages
- Message timestamps
- Responsive design for mobile and desktop
- Smooth animations and transitions

### User Profile
- Editable username
- Avatar generation based on username
- Local storage persistence

### PWA Capabilities
- Offline functionality
- App-like experience
- Mobile installation support
- Automatic updates

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Browser Support

BitChat supports all modern browsers that support ES6+ and Service Workers:
- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Future Enhancements

- WebSocket integration for real-time messaging
- User authentication
- Message encryption
- File sharing capabilities
- Group chat support
- Push notifications

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
