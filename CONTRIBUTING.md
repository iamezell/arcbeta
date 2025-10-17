# 🤝 Contributing to ARC Beta

Thank you for your interest in contributing to ARC Beta! This document provides guidelines and instructions for contributing.

## 🌟 Ways to Contribute

- 🐛 Report bugs
- 💡 Suggest new features
- 📝 Improve documentation
- 🔧 Submit bug fixes
- ✨ Add new features
- 🎨 Improve UI/UX
- ⚡ Optimize performance

## 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/arcbeta.git
   cd arcbeta
   ```
3. **Follow the setup guide** in [SETUP.md](SETUP.md)
4. **Create a new branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📋 Development Guidelines

### Code Style

- Use **TypeScript** for type safety
- Follow **ESLint** rules (if configured)
- Use **meaningful variable names**
- Add **comments** for complex logic
- Keep functions **small and focused**

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add voice chat support
fix: resolve camera clipping issue
docs: update API documentation
style: format code with prettier
refactor: simplify FPS controller logic
test: add unit tests for role validation
chore: update dependencies
```

### Testing

Before submitting:

1. Test locally with multiple browser tabs
2. Test all three roles (Director, Actor, Audience)
3. Test WebXR mode if applicable
4. Check browser console for errors
5. Test on different browsers (Chrome, Firefox, Safari)

## 🐛 Reporting Bugs

Create an issue with:

- **Clear title** describing the bug
- **Steps to reproduce** the issue
- **Expected behavior**
- **Actual behavior**
- **Screenshots** (if applicable)
- **Environment details**:
  - OS and version
  - Browser and version
  - Node.js version
  - Any error messages

**Example**:
```markdown
## Bug: Camera clipping through ground

### Steps to Reproduce
1. Join as Actor
2. Move to coordinates (5, 0, 5)
3. Camera falls through ground

### Expected
Camera should stay at y=1.6

### Actual
Camera position becomes y=-10

### Environment
- Windows 11
- Chrome 120
- Node.js 18.17.0
```

## 💡 Suggesting Features

Create an issue with:

- **Clear description** of the feature
- **Use case** - why is it needed?
- **Proposed implementation** (optional)
- **Mockups or diagrams** (if helpful)

## 🔧 Pull Request Process

1. **Update your fork**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Make your changes**:
   - Write clean, documented code
   - Follow existing code style
   - Add comments where needed

3. **Test thoroughly**:
   - Ensure no linting errors
   - Test all affected features
   - Check for console errors

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**:
   - Go to the original repository
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template

### PR Checklist

- [ ] Code follows project style
- [ ] Comments added for complex logic
- [ ] No linting errors
- [ ] Tested locally
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or documented)

## 📝 Documentation

When adding features, update:

- **README.md** - User-facing changes
- **API.md** - API changes
- **SETUP.md** - Setup process changes
- **Code comments** - Complex logic

## 🎨 UI/UX Changes

For UI changes:

- Maintain consistent styling
- Ensure responsiveness (mobile/desktop)
- Test accessibility (keyboard navigation, screen readers)
- Include screenshots in PR

## 🏗️ Architecture

### Backend Structure
```
backend/
├── app.ts              # Express app
├── https-server.ts     # HTTPS + Socket.IO
├── config/             # Configuration
├── models/             # Mongoose models
├── routes/             # Express routes
├── sockets/            # Socket.IO handlers
└── utils/              # Utility functions
```

### Frontend Structure
```
src/
├── arc-client.ts       # Main 3D client
├── fps-controller.ts   # Movement controller
└── socket-client.ts    # Socket.IO wrapper
```

### Key Technologies
- **Backend**: Express, Socket.IO, Mongoose
- **Frontend**: Three.js, WebXR, Vite
- **Database**: MongoDB Atlas

## 🤔 Questions?

- Open an issue with the "question" label
- Check existing issues and documentation first

## 📜 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- No harassment or discrimination

## 🎉 Recognition

Contributors will be acknowledged in:
- README.md contributors section
- Release notes for significant contributions

---

**Thank you for contributing to ARC Beta! 🎭**

