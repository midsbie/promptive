interface Route {
  path: string;
  handler: () => void;
}

export class Router {
  private routes: Route[] = [];
  private currentView: any = null;

  constructor() {
    window.addEventListener("hashchange", () => this.handleRoute());
    window.addEventListener("load", () => this.handleRoute());
  }

  addRoute(path: string, handler: () => void): void {
    this.routes.push({ path, handler });
  }

  navigate(path: string): void {
    window.location.hash = path;
  }

  setCurrentView(view: any): void {
    this.currentView = view;
  }

  private handleRoute(): void {
    const hash = window.location.hash.slice(1) || "/";

    if (this.currentView?.destroy) {
      this.currentView.destroy();
    }

    for (const route of this.routes) {
      if (this.matchRoute(route.path, hash)) {
        route.handler();
        return;
      }
    }

    this.navigate("/");
  }

  private matchRoute(routePath: string, currentPath: string): boolean {
    if (routePath === currentPath) return true;

    // Handle dynamic routes like /editor/:id
    const routeParts = routePath.split("/");
    const pathParts = currentPath.split("/");

    if (routeParts.length !== pathParts.length) return false;

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) continue; // dynamic segment
      if (routeParts[i] !== pathParts[i]) return false;
    }

    return true;
  }

  getParam(path: string, paramName: string): string | null {
    const routePath = this.routes.find((r) => this.matchRoute(r.path, path))?.path;
    if (!routePath) return null;

    const routeParts = routePath.split("/");
    const pathParts = path.split("/");

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i] === `:${paramName}`) {
        return pathParts[i] || null;
      }
    }

    return null;
  }
}
