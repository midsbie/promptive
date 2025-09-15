# Use bash with strict mode
SHELL := /usr/bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.ONESHELL:
.SUFFIXES:
.DELETE_ON_ERROR:

# Default goal
.DEFAULT_GOAL := build

# Tools
NPM ?= npm
NPX ?= npx
NODE ?= node
ZIP ?= zip
RM  ?= rm -rf
MKDIR ?= mkdir -p
INSTALL ?= install

# Paths
DIST_DIR := dist
ARTIFACTS_DIR := artifacts

# Manifest
MANIFEST_SRC := src/manifest.json
MANIFEST_OUT := $(DIST_DIR)/manifest.json

# Source files
CSS_OUT := $(DIST_DIR)/content.css $(DIST_DIR)/popup.css $(DIST_DIR)/sidebar.css
HTML_OUT := $(DIST_DIR)/options.html $(DIST_DIR)/popup.html $(DIST_DIR)/sidebar.html
SOURCE_FILES := $(shell find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \))

# Icons
ICONS_SRC := $(wildcard icons/*)
ICONS_OUT := $(patsubst icons/%,$(DIST_DIR)/icons/%,$(ICONS_SRC))

# Package metadata; read from package.json
PKG_NAME := $(shell $(NODE) -p "require('./package.json').name")
PKG_VER  := $(shell $(NODE) -p "require('./package.json').version")
PKG_ZIP  := $(ARTIFACTS_DIR)/$(PKG_NAME)-v$(PKG_VER).zip
MAN_VER  := $(shell $(NODE) -p "require('./$(MANIFEST_SRC)').version")

# A stamp file to avoid re-running the bundler unnecessarily.
# Touches if build completes successfully.
BUNDLE_STAMP := $(DIST_DIR)/.bundle.stamp

# -----------------------------------------------------------------------------
# HELP
# -----------------------------------------------------------------------------
.PHONY: help
help:
	@echo "Targets:"
	@echo "  build              Bundle JS and copy CSS to dist/"
	@echo "  package            Create distributable zip in artifacts/"
	@echo "  publish            Sign & upload to AMO via web-ext (uses WEB_EXT_* env vars)"
	@echo "  clean              Remove build outputs (dist/ artifacts/)"
	@echo "  lint, format       Run repo quality checks via npm"
	@echo
	@echo "Variables you may override: NPM, NPX, NODE, ZIP, RM, MKDIR, INSTALL"
	@echo
	@echo "Firefox credentials:"
	@echo "  WEB_EXT_API_KEY, WEB_EXT_API_SECRET (required)"
	@echo "  WEB_EXT_CHANNEL (optional: listed or unlisted; default listed)"

# -----------------------------------------------------------------------------
# QUALITY
# -----------------------------------------------------------------------------
.PHONY: lint
lint:
	$(NPM) run lint

.PHONY: format
format:
	$(NPM) run format

# -----------------------------------------------------------------------------
# BUILD
# -----------------------------------------------------------------------------
# The bundling step (TS -> dist/*.js) is tracked by a stamp so dependent targets
# can rely on it without re-invoking npm on every make call.
$(BUNDLE_STAMP): package.json scripts/build.mjs $(SOURCE_FILES)
	@$(MKDIR) $(DIST_DIR)
	$(NPM) run build
	@touch $@

$(MANIFEST_OUT): $(MANIFEST_SRC) | $(DIST_DIR)
	@$(INSTALL) -m 0644 "$<" "$@"

# Map src/<name>/<name>.css -> dist/<name>.css (e.g., content, sidebar)
# This matches src/content/content.css -> dist/content.css and src/sidebar/sidebar.css -> dist/sidebar.css
$(DIST_DIR)/%.css: src/*/%.css | $(DIST_DIR)
	@$(INSTALL) -m 0644 "$<" "$@"

$(DIST_DIR)/%.css $(DIST_DIR)/%.html: src/*/% | $(DIST_DIR)
	@$(INSTALL) -m 0644 "$<" "$@"

# Map src/<name>/<name>.html -> dist/<name>.html (e.g., content, sidebar)
# This matches src/options/options.html -> dist/options.html and src/sidebar/sidebar.html -> dist/sidebar.html
$(DIST_DIR)/%.html: src/*/%.html | $(DIST_DIR)
	@$(INSTALL) -m 0644 "$<" "$@"

# Copy icons to dist/icons/
$(DIST_DIR)/icons/%: icons/% | $(DIST_DIR)/icons
	@$(INSTALL) -m 0644 "$<" "$@"

# Ensure dist folder exists for order-only prerequisites
$(DIST_DIR) $(DIST_DIR)/icons $(ARTIFACTS_DIR):
	@$(MKDIR) $@

# High-level build target
.PHONY: build
build: verify-version $(BUNDLE_STAMP) $(MANIFEST_OUT) $(CSS_OUT) $(HTML_OUT) $(ICONS_OUT)
	@echo "Build completed in: $(DIST_DIR)"

# -----------------------------------------------------------------------------
# PACKAGE
# -----------------------------------------------------------------------------
$(PKG_ZIP): build | $(ARTIFACTS_DIR)
	@cd $(DIST_DIR) && $(ZIP) -r -9 -X "$(abspath $@)" . -x "*/.git*"
	@echo "Package created: $@"

.PHONY: package
package: verify-version $(PKG_ZIP)

# -----------------------------------------------------------------------------
# PUBLISH FIREFOX (AMO)
# -----------------------------------------------------------------------------
# Uses web-ext to sign & submit. Requires:
#   WEB_EXT_API_KEY, WEB_EXT_API_SECRET
# Optional:
#   WEB_EXT_CHANNEL=listed|unlisted (default: listed)
.PHONY: publish
publish: build | $(ARTIFACTS_DIR)
	@if [ -z "$$WEB_EXT_API_KEY" ] || [ -z "$$WEB_EXT_API_SECRET" ]; then \
	  echo "Missing WEB_EXT_API_KEY / WEB_EXT_API_SECRET"; exit 1; \
	fi
  # web-ext will bundle automatically; we call it from repo root
	$(NPX) --yes web-ext sign \
	  --source-dir . \
	  --artifacts-dir "$(ARTIFACTS_DIR)" \
	  $${WEB_EXT_CHANNEL:+--channel $$WEB_EXT_CHANNEL}
	@echo "Submitted artifacts in $(ARTIFACTS_DIR) to AMO"

# -----------------------------------------------------------------------------
# UTILITIES
# -----------------------------------------------------------------------------
.PHONY: verify-version
verify-version:
	@if [ "$(PKG_VER)" != "$(MAN_VER)" ]; then \
	  echo "Version mismatch: package.json=$(PKG_VER) manifest.json=$(MAN_VER)" >&2; \
	  exit 1; \
	fi

# -----------------------------------------------------------------------------
# CLEAN
# -----------------------------------------------------------------------------
.PHONY: clean
clean:
	$(RM) "$(DIST_DIR)" "$(ARTIFACTS_DIR)"
	@echo "Cleaned"
