# Not currently using this file...
#

BUILD			:= "./build"
SRC				:= "./src"
NPM_PACKAGE 	:= $(shell node -e 'process.stdout.write(require("./package.json").name)')
NPM_VERSION 	:= $(shell node -e 'process.stdout.write(require("./package.json").version)')
NPM_URL 		:= $(shell node -e 'process.stdout.write(require("./package.json").homepage)')
#CURR_HEAD		:= $(firstword $(shell git show-ref --hash HEAD | cut -b -6) master)
#GITHUB_PROJ		:= https://github.com/cutephoton/ts-yaml

.PHONY: 		help build test clean info

help:
	@echo "make help       - Print this help"
	@echo "make build      - Build source"
	@echo "make clean      - Clean up the mess!"
	@echo "make test       - Run tests"

build:
	@echo "[build]"
	@node run build

clean:
	@echo "[clean]"
	@node run clean

test: build
	@echo "[test]"
	@node run test

info:
	@echo "Package:       $(NPM_PACKAGE) $(NPM_VERSION)"
	@echo "Project:       $(NPM_URL)"
	@echo "Current Head:  $(CURR_HEAD)"

