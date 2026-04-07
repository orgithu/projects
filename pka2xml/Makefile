.PHONY: all
all: static-install

.PHONY: static-install
static-install: pka2xml-static xml2pkt-static patch-static install

.PHONY: static-install-docker
static-install-docker: pka2xml-static-docker xml2pkt-static-docker patch-static install

.PHONY: dynamic-install
dynamic-install: pka2xml-dynamic xml2pkt-dynamic patch-dynamic install

.PHONY: pka2xml-static
pka2xml-static: main.cpp
	g++ -o pka2xml main.cpp -I/usr/local/include /usr/lib/libz.a /usr/local/lib/libre2.a /usr/local/lib/libcryptopp.a -lpthread -static -static-libstdc++

.PHONY: pka2xml-static-docker
pka2xml-static-docker: main.cpp
	g++ -o pka2xml main.cpp -I/usr/include /usr/lib/x86_64-linux-gnu/libz.a /usr/lib/x86_64-linux-gnu/libre2.a /usr/lib/x86_64-linux-gnu/libcryptopp.a -lpthread -static -static-libstdc++

.PHONY: pka2xml-dynamic
pka2xml-dynamic: main.cpp
	g++ -o pka2xml main.cpp -I/usr/local/include -L/usr/local/lib -lcryptopp -lz -lre2

.PHONY: xml2pkt-static
xml2pkt-static: xml2pkt.cpp
	g++ -o xml2pkt xml2pkt.cpp -I/usr/local/include /usr/lib/libz.a /usr/local/lib/libre2.a /usr/local/lib/libcryptopp.a -lpthread -static -static-libstdc++

.PHONY: xml2pkt-static-docker
xml2pkt-static-docker: xml2pkt.cpp
	g++ -o xml2pkt xml2pkt.cpp -I/usr/include /usr/lib/x86_64-linux-gnu/libz.a /usr/lib/x86_64-linux-gnu/libre2.a /usr/lib/x86_64-linux-gnu/libcryptopp.a -lpthread -static -static-libstdc++

.PHONY: xml2pkt-dynamic
xml2pkt-dynamic: xml2pkt.cpp
	g++ -o xml2pkt xml2pkt.cpp -I/usr/local/include -L/usr/local/lib -lcryptopp -lz -lre2

.PHONY: patch-static
patch-static: patch.c
	gcc -o patch patch.c -static -static-libgcc

.PHONY: patch-dynamic
patch-dynamic: patch.c
	gcc -o patch patch.c

install:
	cp patch /usr/local/bin/PacketTracer
	cp pka2xml /usr/local/bin
	cp xml2pkt /usr/local/bin

clean:
	rm -f patch pka2xml xml2pkt
