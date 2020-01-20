#!make

export DENO_DIR 		:= $(.)
export PROJECT			:= take-five
export UPLOAD_PATH 	:= toddself.fastmail.com/files/static-pkg.dev
export SERVER				:= https://webdav.fastmail.com
TEST_FILES      		:= $(wildcard *_test.ts)
SOURCE_FILES				:= take-five.ts\
												wayfarer.ts
APP_FILES						:= $(wildcard *.ts)

mod.ts: take-five.ts
		deno bundle take-five.ts > mod.ts

.PHONY: test fetch all clean release

all: clean test release

clean:
		rm -f mod.ts release.json output.json index.html

test:
		$(foreach var,$(TEST_FILES),deno --allow-net $(var);)

fetch:
		$(foreach var,$(SOURCE_FILES),deno fetch $(var);)

release: $(APP_FILES)
		./release.sh $^