#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>

#include "include/pka2xml.hpp"

void die(const char *message) {
  std::fprintf(stderr, "%s\n", message);
  std::exit(1);
}

void help() {
  std::printf(R"(usage: xml2pkt <input.xml> <output.pkt>

Convert XML file back to Packet Tracer .pkt format.

example:
  xml2pkt foobar.xml foobar.pkt
)");
  std::exit(1);
}

int main(int argc, char *argv[]) {
  if (argc != 3) {
    help();
  }

  try {
    std::ifstream f_in{argv[1]};
    if (!f_in.is_open()) {
      die("error: cannot open input file");
    }
    
    std::string input{std::istreambuf_iterator<char>(f_in), std::istreambuf_iterator<char>()};
    f_in.close();
    
    std::ofstream f_out{argv[2], std::ios::binary};
    if (!f_out.is_open()) {
      die("error: cannot open output file");
    }
    
    f_out << pka2xml::encrypt_pka(input);
    f_out.close();
    
    std::cout << "Successfully converted " << argv[1] << " to " << argv[2] << std::endl;
    
  } catch (const std::exception &e) {
    std::fprintf(stderr, "error: %s\n", e.what());
    return 1;
  } catch (...) {
    die("error: failed to process file, make sure input is valid XML");
  }
  
  return 0;
}
