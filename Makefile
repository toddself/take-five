#!make

export DENO_DIR := $(.)
SOURCE_FILES := take-five.ts\
								wayfarer.ts
TEST_FILES :=	$(wildcard *_test.ts)

.PHONY: test fetch bundle all clean

all: clean test bundle

clean:
		rm mod.ts

test:
		$(foreach var,$(TEST_FILES),deno --allow-net $(var);)

fetch:
		$(foreach var,$(SOURCE_FILES),deno fetch $(var);)

bundle:
		deno bundle take-five.ts > mod.ts