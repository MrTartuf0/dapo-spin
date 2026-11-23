# Test del firmware sul computer: make
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wno-unused-parameter -Wno-unused-variable
FW := ../../firmware/DapoIMU
DEPS := $(wildcard mock/*.h) $(FW)/DapoIMU.ino $(FW)/DapoOTA.cpp $(FW)/DapoOTA.h $(FW)/version.h

test: test_fusion test_ota
	./test_fusion
	./test_ota

test_fusion: test_fusion.cpp $(DEPS)
	$(CXX) $(CXXFLAGS) -DDAPO_HOST_TEST -Imock test_fusion.cpp $(FW)/DapoOTA.cpp -o $@

test_ota: test_ota.cpp $(DEPS)
	$(CXX) $(CXXFLAGS) -DDAPO_HOST_TEST -Imock test_ota.cpp $(FW)/DapoOTA.cpp -o $@

clean:
	rm -f test_fusion test_ota

.PHONY: test clean
