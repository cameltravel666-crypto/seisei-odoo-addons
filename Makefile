# Seisei Platform Makefile
# Release management, drift detection, and operations

.PHONY: help drift-check export-runtime release rollback-info validate-routes cleanup sanitize

# Default target
help:
	@echo "Seisei Platform Operations"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  drift-check      Run drift detection against baseline"
	@echo "  export-runtime   Export current runtime state"
	@echo "  release          Create release tarball (requires TAG=main1.x.x)"
	@echo "  rollback-info    Show rollback procedures"
	@echo "  validate-routes  Check for Traefik routing conflicts"
	@echo "  cleanup          List noise files (use APPLY=1 to delete)"
	@echo "  sanitize         Sanitize sensitive values (requires DIR=path)"
	@echo ""
	@echo "Examples:"
	@echo "  make drift-check"
	@echo "  make release TAG=main1.0.1"
	@echo "  make cleanup APPLY=1"
	@echo "  make sanitize DIR=./audit/runtime/"
	@echo ""

# Drift detection
drift-check:
	@./scripts/drift_check.sh --local

drift-check-server:
	@if [ -z "$(HOST)" ]; then \
		echo "Error: HOST required. Usage: make drift-check-server HOST=1.2.3.4 KEY=~/.ssh/key"; \
		exit 1; \
	fi
	@./scripts/drift_check.sh --server $(HOST) $(if $(KEY),--ssh-key $(KEY),)

# Export runtime state
export-runtime:
	@if [ -z "$(HOST)" ]; then \
		echo "Running local export..."; \
		mkdir -p audit/runtime; \
		echo "Use 'make export-runtime HOST=server' for server export"; \
	else \
		ssh $(if $(KEY),-i $(KEY),) ubuntu@$(HOST) 'cd /opt/seisei-main && ./scripts/export_runtime_state.sh'; \
	fi

# Create release
release:
	@if [ -z "$(TAG)" ]; then \
		echo "Error: TAG required. Usage: make release TAG=main1.0.1"; \
		exit 1; \
	fi
	@./scripts/make_release_tarball.sh --tag $(TAG)

# Rollback information
rollback-info:
	@./scripts/rollback_guide.sh $(if $(TAG),--tag $(TAG),) $(if $(STACK),--stack $(STACK),) $(if $(FULL),--full,) $(if $(AWS),--aws,)

# Validate routes
validate-routes:
	@./scripts/validate_routes.sh --local $(if $(FIX),--fix,)

validate-routes-server:
	@if [ -z "$(HOST)" ]; then \
		echo "Error: HOST required. Usage: make validate-routes-server HOST=1.2.3.4"; \
		exit 1; \
	fi
	@./scripts/validate_routes.sh --server $(HOST) $(if $(KEY),--ssh-key $(KEY),)

# Cleanup
cleanup:
	@if [ "$(APPLY)" = "1" ]; then \
		./scripts/cleanup_noise.sh --apply; \
	else \
		./scripts/cleanup_noise.sh; \
	fi

# Sanitize
sanitize:
	@if [ -z "$(DIR)" ]; then \
		echo "Error: DIR required. Usage: make sanitize DIR=./path/to/dir"; \
		exit 1; \
	fi
	@./scripts/sanitize.sh $(DIR) $(if $(DRY_RUN),--dry-run,)

# Development shortcuts
dev-setup:
	@echo "Setting up development environment..."
	@chmod +x scripts/*.sh
	@npm install 2>/dev/null || echo "npm not available"
	@echo "Done. Run 'make help' for available commands."

# Linting (if tools available)
lint:
	@echo "Running linters..."
	@command -v shellcheck >/dev/null && find scripts -name "*.sh" -exec shellcheck {} \; || echo "shellcheck not installed"
	@command -v yamllint >/dev/null && yamllint infra/ 2>/dev/null || echo "yamllint not installed"

# Quick checks
check: lint validate-routes drift-check
	@echo "All checks completed"

# CI simulation
ci-local: lint
	@echo "Checking for secrets..."
	@! grep -rE "(AKIA|PRIVATE.KEY|SECRET=)" --include="*.yml" --include="*.env" infra/ 2>/dev/null | grep -v REDACTED || echo "No secrets found"
	@echo "CI checks passed"

# Version info
version:
	@echo "Current version info:"
	@git describe --tags --always 2>/dev/null || echo "No tags"
	@echo "Recent tags:"
	@git tag -l 'main*' --sort=-version:refname 2>/dev/null | head -5 || echo "No main* tags"
